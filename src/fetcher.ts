import * as TonVoteSdk from "ton-vote-contracts-sdk";
import { TonClient, TonClient4 } from "ton";
import { State } from "./state";
import { MetadataArgs, DaoRoles, ReleaseMode } from "ton-vote-contracts-sdk";
import { DaosData, NftHolders, ProposalAddrWithMissingNftCollection, ProposalsByState, ProposalsData, ProposalFetchingErrorReason } from "./types";
import dotenv from 'dotenv';
import _ from 'lodash';
import { getOrderedDaosByPriority, sendNotification } from "./helpers";


dotenv.config();

const DAOS_BATCH_SIZE = 100;
const PROPOSALS_BATCH_SIZE = 100;

const UPDATE_DAOS_BATCH_SIZE = 35;
const PROPOSAL_METADATA_BATCH_SIZE = 35;


const RELEASE_MODE = Number(process.env.RELEASE_MODE) as ReleaseMode


export class Fetcher {

    private client!: TonClient;
    private client4!: TonClient4;
    private state: State;
    private fetchUpdate: {[proposalAddress: string]: number} = {};
    private finished: boolean = true;
    private proposalsByState: ProposalsByState = {pending: new Set(), active: new Set(), ended: new Set()};

    private daosData!: DaosData;
    private proposalsData!: ProposalsData;
    private nftHolders!: NftHolders;

    private proposalAddrWithMissingNftCollection: ProposalAddrWithMissingNftCollection = new Set();

    constructor(state: State) {
        this.state = state;
    }

    async init() {
        await sendNotification('Ton Vote Cache Server started');
        // this.client = await TonVoteSdk.getClientV2();
        this.client = new TonClient({endpoint: 'https://mainnet.tonhubapi.com/jsonRPC'}); 
        this.client4 = await TonVoteSdk.getClientV4();

        console.log('starting with masterchainInfo: ', await this.client.getMasterchainInfo())
        await this.updateRegistry();
    }

    async updateRegistry() {
        const registry = await TonVoteSdk.getRegistry(this.client, RELEASE_MODE);
        console.log(`registry: `, registry);
        
        if (!registry) throw('Please deploy registry before starting ton vote cache server');
        
        this.state.setRegistry(registry);
    }

    getState() {
        this.daosData = _.cloneDeep(this.state.getDaosData());
        this.proposalsData = _.cloneDeep(this.state.getProposalsData());
        this.nftHolders = _.cloneDeep(this.state.getNftHolders());        
    }

    async setState() {            
        this.state.setDaosData(this.daosData);
        this.state.setProposalsData(this.proposalsData);
        this.state.setNftHolders(this.nftHolders); 
        this.state.setUpdateTime()
    }

    async fetchNewDaos() {
        
        console.log(`fetchNewDaos started`);
        
        console.log(`daosData.nextDaoId = ${this.daosData.nextDaoId}`);
        
        let newDaos = await TonVoteSdk.getDaos(this.client, RELEASE_MODE, this.daosData.nextDaoId, DAOS_BATCH_SIZE, 'asc');
        
        if (newDaos.daoAddresses.length == 0) return;

        console.log(`${newDaos.daoAddresses.length} new daos will be added: `, newDaos.daoAddresses);

        const batchSize = UPDATE_DAOS_BATCH_SIZE; 
        const daos = newDaos.daoAddresses;
        const chunks = [];
        for (let i = 0; i < daos.length; i += batchSize) {
          chunks.push(daos.slice(i, i + batchSize));
        }
        
        for (const chunk of chunks) {
          await Promise.all(chunk.map(async (daoAddress) => {
            const daoState = await TonVoteSdk.getDaoState(this.client, daoAddress);
            const metadataArgs = await TonVoteSdk.getDaoMetadata(this.client, daoState.metadata);
            
            console.log(`inserting daoState and metadata for dao at address ${daoAddress}: `, daoState, metadataArgs);
            
            this.daosData.daos.set(daoAddress, {
              daoAddress: daoAddress,
              daoId: daoState.daoIndex,
              daoMetadata: {metadataAddress: daoState.metadata, metadataArgs: metadataArgs},
              daoRoles: {owner: daoState.owner, proposalOwner: daoState.proposalOwner},
              nextProposalId: 0,
              daoProposals: []
            });
          }));
        }
        
        const sortedDaos = new Map<string, {
            daoAddress: string,
            daoId: number,
            daoMetadata: {metadataAddress: string, metadataArgs: MetadataArgs},
            daoRoles: DaoRoles,
            nextProposalId: number,
            daoProposals: string[]
        }>(Array.from(this.daosData.daos.entries()).sort((a, b) => a[1].daoId - b[1].daoId));

        const orderedDaosFromFile: string[] = await getOrderedDaosByPriority();
        
        let mergedDaosData: DaosData = {nextDaoId: newDaos.endDaoId, daos: new Map()};
        for (const key of orderedDaosFromFile) {
          if (sortedDaos.has(key)) {
            mergedDaosData.daos.set(key, sortedDaos.get(key)!);
            sortedDaos.delete(key);
          }
        }
      
        for (const [key, value] of sortedDaos) {
          mergedDaosData.daos.set(key, value);
        }
              
        this.daosData.daos = mergedDaosData.daos;
        this.daosData.nextDaoId = mergedDaosData.nextDaoId;
    }

    async updateDaosStateIfChangedOnChain() {
        console.log(`updateDaosStateIfChangedOnChain started`);
    
        if (this.daosData.daos.size == 0) return;
    
        const batchSize = UPDATE_DAOS_BATCH_SIZE; 
        const daos = Array.from(this.daosData.daos.keys());
        const chunks = [];
        for (let i = 0; i < daos.length; i += batchSize) {
            chunks.push(daos.slice(i, i + batchSize));
        }
    
        for (const chunk of chunks) {
            const results = await Promise.allSettled(chunk.map(async (daoAddress) => {
                const daoState = await TonVoteSdk.getDaoState(this.client, daoAddress);
    
                if (_.isEqual(daoState, this.daosData.daos.get(daoAddress))) {
                    return;
                }
    
                console.log(`fetching new Dao Metadata for ${daoAddress} ...`);
    
                const metadataArgs = await TonVoteSdk.getDaoMetadata(this.client, daoState.metadata);
    
                let daoToUpdate = this.daosData.daos.get(daoAddress);
                daoToUpdate!.daoMetadata = {metadataAddress: daoState.metadata, metadataArgs: metadataArgs};
                daoToUpdate!.daoRoles = {owner: daoState.owner, proposalOwner: daoState.proposalOwner};
    
                console.log(`Dao Metadata for ${daoAddress} was updated successfully`);
            }));
    
            // handle individual results
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`Failed to process daoAddress at index ${index} with reason: ${result.reason}`);
                }
            });
        }
    }
      
    async updateDaosProposals() {

        console.log(`updateDaosProposals started`);

        const daos = Array.from(this.daosData.daos.entries());
        const daoBatchSize = DAOS_BATCH_SIZE;
        const daoBatches = [];
        
        for (let i = 0; i < daos.length; i += daoBatchSize) {
            daoBatches.push(daos.slice(i, i + daoBatchSize));
        }
        
        for (const daoBatch of daoBatches) {
            
            await Promise.all(daoBatch.map(async ([daoAddress, daoData]) => {
                
                console.log(`fetching proposals for dao ${daoAddress}`);
                const newProposals = await TonVoteSdk.getDaoProposals(this.client, daoAddress, daoData.nextProposalId, PROPOSALS_BATCH_SIZE, 'asc');
                
                if (newProposals.proposalAddresses) {
                    
                    console.log(`Dao at address ${daoAddress}: ${newProposals.proposalAddresses?.length} newProposals: `, newProposals);
                    const allPromises: Promise<void>[] = [];
                    const chunks = [];
                    const proposalAddresses = newProposals.proposalAddresses;
                    const batchSize = PROPOSAL_METADATA_BATCH_SIZE;
                    
                    for (let i = 0; i < proposalAddresses.length; i += batchSize) {
                        chunks.push(proposalAddresses.slice(i, i + batchSize));
                    }
        
                    for (const chunk of chunks) {
                        chunk.forEach(proposalAddress => {
                            const promise = (async () => {
                                console.log(`fetching info from proposal at address ${proposalAddress}`);
                                const proposalMetadata = await TonVoteSdk.getProposalMetadata(this.client, this.client4, proposalAddress);
                                this.proposalsData.set(proposalAddress, {
                                    daoAddress: daoAddress,
                                    proposalAddress: proposalAddress,
                                    metadata: proposalMetadata
                                });
                                this.proposalsByState.pending = this.proposalsByState.pending.add(proposalAddress);
                                if ((proposalMetadata.votingPowerStrategies[0].type == TonVoteSdk.VotingPowerStrategyType.NftCcollection) || 
                                (proposalMetadata.votingPowerStrategies[0].type == TonVoteSdk.VotingPowerStrategyType.NftCcollection_1Wallet1Vote)) {
                                    console.log(`adding proposal address ${proposalAddress} to missing nft collections`);
                                    this.proposalAddrWithMissingNftCollection.add(proposalAddress)
                                }
                            })();
                            allPromises.push(promise);
                        });

                        await Promise.all(allPromises);
                    }

                    daoData.nextProposalId = newProposals.endProposalId;
                    const sortedProposals = newProposals.proposalAddresses!.sort((a, b) => this.proposalsData.get(b)?.metadata.id! - this.proposalsData.get(a)?.metadata.id!);
                    daoData.daoProposals = [...daoData.daoProposals, ...sortedProposals];
                    this.daosData.daos.set(daoAddress, daoData);
                
                } else {
                    console.log(`no proposals found for Dao at address ${daoAddress}`);
                }

            }));
        }               
    }

    async updateProposalMetadataIfChangedOnChain() {

        console.log(`updateProposalMetadataIfChangedOnChain started`);

        const pendingProposalsArray = [...this.proposalsByState.pending];
        const batchSize = 50;
        
        while (pendingProposalsArray.length > 0) {
          const batch = pendingProposalsArray.splice(0, Math.min(batchSize, pendingProposalsArray.length));
        
          await Promise.all(batch.map(async (proposalAddress) => {
            const proposalMetadata = await TonVoteSdk.getProposalMetadata(this.client, this.client4, proposalAddress);
        
            if (_.isEqual(proposalMetadata, this.proposalsData.get(proposalAddress)?.metadata)) return;
        
            console.log(`proposal metadata at ${this.proposalsData.get(proposalAddress)?.metadata} was changed`);
        
            this.proposalsData.set(proposalAddress, {
              daoAddress: this.proposalsData.get(proposalAddress)?.daoAddress!,
              proposalAddress: proposalAddress,
              metadata: proposalMetadata
            });
          }));
        }                            
    }

    updateProposalsState() {

        console.log(`updateProposalsState started`);

        const now = Date.now() / 1000;

        this.proposalsByState.pending.forEach(proposalAddress => {
            
            const metadata = this.proposalsData.get(proposalAddress)?.metadata;

            if (!metadata) {
                console.log(`unexpected error: could not find metadata at propsal ${proposalAddress}`);
                return;                
            }

            if (metadata.proposalStartTime <= now && metadata.proposalEndTime >= now) {                
                this.proposalsByState.active.add(proposalAddress);
                this.proposalsByState.pending.delete(proposalAddress);
                console.log(`proposal ${proposalAddress} was moved to active proposals`);
            }

            else if (metadata.proposalStartTime <= now && metadata.proposalEndTime <= now) {
                this.proposalsByState.ended.add(proposalAddress);
                this.proposalsByState.pending.delete(proposalAddress);
                console.log(`proposal ${proposalAddress} was moved to ended proposals`);
            }
        }); 

        this.proposalsByState.active.forEach(proposalAddress => {

            const metadata = this.proposalsData.get(proposalAddress)?.metadata;

            if (!metadata) {
                console.log(`unexpected error: could not find metadata at propsal ${proposalAddress}`);
                return;                
            }

            if (metadata.proposalStartTime <= now && metadata.proposalEndTime <= now) {
                this.proposalsByState.ended.add(proposalAddress);
                this.proposalsByState.pending.delete(proposalAddress);
                console.log(`proposal ${proposalAddress} was moved to ended proposals`);
            }

        }); 

        console.log(this.proposalsByState);
        
    }

    async updatePendingProposalData() {
        
        console.log(`updatePendingProposalData started`);
       
        for (const proposalAddr of [...this.proposalAddrWithMissingNftCollection]) {
            let proposalData = this.proposalsData.get(proposalAddr);
        
            if (!(proposalAddr in this.nftHolders)) {
                try {
                    console.log(`fetching nft items data for proposalAddr ${proposalAddr}`);
                    this.nftHolders[proposalAddr] = await TonVoteSdk.getAllNftHolders(this.client4, proposalData!.metadata);
                } catch (error) {
                    console.log(`failed to fetch nft items for proposal ${proposalAddr}: ${error}`);
                    proposalData!.fetchErrorReason = ProposalFetchingErrorReason.FETCH_NFT_ERROR;
                    this.proposalsData.set(proposalAddr, proposalData!);
                    continue;
                }
            } else {
                console.log(`nft items already exist in nftHolder, skipping fetching data proposalAddr ${proposalAddr}`);
            }
        
            console.log(`updatePendingProposalData: updating nft holders for proposal ${proposalAddr}: `, this.nftHolders[proposalAddr]);
            this.proposalAddrWithMissingNftCollection.delete(proposalAddr);
        }                        
    }

    async updateProposalVotingData() {

        console.log(`updateProposalVotingData started`);
        
        await Promise.all([...this.proposalsByState.active, ...this.proposalsByState.ended].map(async (proposalAddr) => {

            if (this.proposalsByState.ended.has(proposalAddr) && (proposalAddr in this.fetchUpdate)) {
                return;
            }

            let proposalData = this.proposalsData.get(proposalAddr);
            let proposalVotingData = proposalData!.votingData;

            if (!proposalData) {
                console.log(`unexpected error: proposalAddr ${proposalAddr} was not found on proposalData`);
                return;
            }

            if (proposalData!.fetchErrorReason != undefined) {
                console.log(`Not all data for proposal ${proposalAddr} was fetched properly, fetch error (${proposalData!.fetchErrorReason} was found), skipping voting data update`);
                return;
            }

            if (!proposalVotingData) {
                proposalVotingData = {
                    txData: {allTxns: [], maxLt: undefined},
                    votingPower: {},
                    votes: {},
                    proposalResult: {yes: 0, no: 0, abstain: 0, totalWeight: '0'}
                }
            }

            const newTx = await TonVoteSdk.getTransactions(this.client, proposalAddr, proposalVotingData.txData.maxLt);

            if (newTx.maxLt == proposalVotingData.txData.maxLt) {
                console.log(`Nothing to fetch for proposal at ${proposalAddr}`);
                this.fetchUpdate[proposalAddr] = Date.now();
                return;
            }
            
            newTx.allTxns = [...newTx.allTxns, ...proposalVotingData.txData.allTxns]
            // TODO: getAllVotes - use only new tx not all of them
            let newVotes = TonVoteSdk.getAllVotes(newTx.allTxns, proposalData.metadata);
                        
            let newVotingPower = await TonVoteSdk.getVotingPower(this.client4, proposalData.metadata, newTx.allTxns, proposalVotingData.votingPower, proposalData.metadata.votingPowerStrategies[0].type, this.nftHolders[proposalAddr]);
            let newProposalResults = TonVoteSdk.getCurrentResults(newTx.allTxns, newVotingPower, proposalData.metadata);

            proposalVotingData.proposalResult = newProposalResults;
            proposalVotingData.txData = newTx;
            proposalVotingData.votes = newVotes;
            proposalVotingData.votingPower = newVotingPower;

            proposalData.votingData = proposalVotingData;
            this.proposalsData.set(proposalAddr, proposalData!);

            console.log('setting new proposalData: ', proposalData);
            
            this.fetchUpdate[proposalAddr] = Date.now();

        }));
    }

    updateDaosSortingScore() {
      
        this.daosData.daos.forEach((dao) => {
            let sortingScore = 0;
            let emaSortingScore = 0;
            const alpha = 0.1;
            // num voters * log(total weight) * 
            for (const proposal of dao.daoProposals) {
                const proposalData = this.proposalsData.get(proposal);
                if (!proposalData) continue;
                const votingData = proposalData!.votingData!;
                if (!votingData) continue;
                const totalWeight = Number(votingData.proposalResult.totalWeight);
                let lastTxTime = proposalData.votingData?.txData.allTxns[0].now;
                if (!lastTxTime) continue;
                sortingScore = Math.log10(totalWeight) * Object.keys(votingData.votes).length * (Date.now() - lastTxTime);
                emaSortingScore = emaSortingScore + alpha * (sortingScore - emaSortingScore);
              }
              
            // res *= * ~ 1 / log (now - last_proposal_timestamp)
            // create_dao_date
        });

    }

    getProposalsByState() {
        return this.proposalsByState;
    }

    async run() {

        try {
            
            const startTime = Date.now();

            if (!this.finished) {
                console.log('skipping run, still featching ...');            
                return;
            }

            this.finished = false;

            this.getState();

            await this.fetchNewDaos();
                        
            await this.updateDaosStateIfChangedOnChain();

            await this.updateDaosProposals();

            await this.updateProposalMetadataIfChangedOnChain();

            this.updateProposalsState();

            await this.updatePendingProposalData();

            await this.updateProposalVotingData();
            
            this.setState();
            this.finished = true;

            console.log(`Stats: ${this.daosData.daos.size} Daos, ${this.proposalsData.size} Proposals`);
            console.log(`Finished in ${(Date.now()-startTime)/1000} seconds`); 
            console.log(`------------------------------------------------------------`);                       

        } catch (error) {

            this.finished = true;            
            console.log('unexpected error: ', (error as Error).stack);
            await sendNotification(`unexpected error: ${(error as Error).stack}`);
            console.log(`------------------------------------------------------------`);                       
        }
    }

    getFetchUpdateTime(proposalAddress: string) {
        return this.fetchUpdate[proposalAddress];
    }

    getProposalAddrWithMissingNftCollection() {
        return this.getProposalAddrWithMissingNftCollection;
    }

}