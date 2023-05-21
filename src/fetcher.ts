import * as TonVoteSdk from "ton-vote-contracts-sdk";
import { TonClient, TonClient4 } from "ton";
import { State } from "./state";
import { MetadataArgs, DaoRoles, ReleaseMode } from "ton-vote-contracts-sdk";
import { DaosData, NftHolders, ProposalsByState, ProposalsData } from "./types";
import dotenv from 'dotenv';
const _ = require('lodash');


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
    finished: boolean = true;
    proposalsByState: ProposalsByState = {pending: new Set(), active: new Set(), ended: new Set()};

    constructor(state: State) {
        this.state = state;
    }

    async init() {
        this.client = await TonVoteSdk.getClientV2();
        this.client4 = await TonVoteSdk.getClientV4();

        console.log('starting with masterchainInfo: ', await this.client.getMasterchainInfo())
        await this.updateRegistry();
    }

    async updateRegistry() {
        const registry = await TonVoteSdk.getRegistry(this.client, RELEASE_MODE);
        console.log(`registry: `, registry);
        
        this.state.setRegistry(registry);
    }

    getState() {
        return {
            daosData: _.cloneDeep(this.state.getDaosData()),
            proposalsData: _.cloneDeep(this.state.getProposalsData()),
            nftHolders: _.cloneDeep(this.state.getNftHolders()),
            // proposalAddrWithMissingNftCollection: this.state.getProposalAddrWithMissingNftCollection()
        }
    }

    async setState(daosData: DaosData, proposalsData: ProposalsData, nftHolders: NftHolders) {            
            this.state.setDaosData(daosData);
            this.state.setProposalsData(proposalsData);
            this.state.setNftHolders(nftHolders); 
            this.state.setUpdateTime()
    }

    async updateDaos(daosData: DaosData) : Promise<DaosData> {
        
        console.log(`updateDaos started`);
        
        console.log(`daosData.nextDaoId = ${daosData.nextDaoId}`);
        
        let newDaos = await TonVoteSdk.getDaos(this.client, RELEASE_MODE, 0 /* daosData.nextDaoId */, DAOS_BATCH_SIZE, 'asc');
        
        if (newDaos.daoAddresses.length == 0) return daosData;

        console.log(`${newDaos.daoAddresses.length} new daos will be added: `, newDaos.daoAddresses);

        const batchSize = UPDATE_DAOS_BATCH_SIZE; 
        const daos = newDaos.daoAddresses;
        const chunks = [];
        for (let i = 0; i < daos.length; i += batchSize) {
          chunks.push(daos.slice(i, i + batchSize));
        }
        
        for (const chunk of chunks) {
          await Promise.all(chunk.map(async (daoAddress) => {
            const daoMetadata = await TonVoteSdk.getDaoMetadata(this.client, daoAddress);
            const daoRoles = await TonVoteSdk.getDaoRoles(this.client, daoAddress);
            const daoId = await TonVoteSdk.getDaoIndex(this.client, daoAddress);
        
            daosData.daos.set(daoAddress, {
              daoAddress: daoAddress,
              daoId: daoId,
              daoMetadata: daoMetadata,
              daoRoles: daoRoles,
              nextProposalId: 0,
              daoProposals: []
            });
          }));
        }
        
        daosData.nextDaoId = newDaos.endDaoId;
        const sortedDaos = new Map<string, {
            daoAddress: string,
            daoId: number,
            daoMetadata: MetadataArgs,
            daoRoles: DaoRoles,
            nextProposalId: number,
            daoProposals: string[]
        }>(Array.from(daosData.daos.entries()).sort((a, b) => a[1].daoId - b[1].daoId));
                
        daosData.daos = sortedDaos;

        return daosData;
    }
    
    async updateDaosProposals(daosData: DaosData, proposalsData: ProposalsData) {

        console.log(`updateDaosProposals started`);

        console.log(`updateDaosProposals: `, proposalsData);

        // TODO: batches on daosData.daos
        await Promise.all(Array.from(daosData.daos.entries()).map(async ([daoAddress, daoData]) => {
            console.log(`fetching proposals for dao ${daoAddress}`);
            
            const newProposals = await TonVoteSdk.getDaoProposals(this.client, daoAddress, daoData.nextProposalId, PROPOSALS_BATCH_SIZE, 'asc');
            
            if (newProposals.proposalAddresses) {
        
                console.log(`address ${daoAddress}: ${newProposals.proposalAddresses?.length} newProposals: `, newProposals);
        
                const batchSize = PROPOSAL_METADATA_BATCH_SIZE;

                const proposalAddresses = newProposals.proposalAddresses;
                const chunks = [];
                for (let i = 0; i < proposalAddresses.length; i += batchSize) {
                  chunks.push(proposalAddresses.slice(i, i + batchSize));
                }
                
                for (const chunk of chunks) {
                  await Promise.all(chunk.map(async (proposalAddress) => {
                    console.log(`fetching info from proposal at address ${proposalAddress}`);
                    const proposalMetadata = await TonVoteSdk.getProposalMetadata(this.client, this.client4, proposalAddress);
                
                    proposalsData.set(proposalAddress, {
                      daoAddress: daoAddress,
                      proposalAddress: proposalAddress,
                      metadata: proposalMetadata
                    });
                
                    this.proposalsByState.pending = this.proposalsByState.pending.add(proposalAddress);
                
                    if (proposalMetadata.votingPowerStrategies[0].type == TonVoteSdk.VotingPowerStrategyType.NftCcollection) {
                      this.state.addProposalAddrToMissingNftCollection(proposalAddress)
                    }
                  }));
                }
                        
                daoData.nextProposalId = newProposals.endProposalId;

                const sortedProposals = newProposals.proposalAddresses!.sort((a, b) => proposalsData.get(a)?.metadata.id! - proposalsData.get(b)?.metadata.id!);
                daoData.daoProposals = [...daoData.daoProposals, ...sortedProposals];
                daosData.daos.set(daoAddress, daoData);
        
            } else {
                console.log(`no proposals found for dao ${daoAddress}`);
            }
        }));

        return {daosData, proposalsData};
    }

    updateProposalsState(proposalsData: ProposalsData) {

        console.log(`updateProposalsState started`);

        const now = Date.now() / 1000;

        this.proposalsByState.pending.forEach(proposalAddress => {
            
            const metadata = proposalsData.get(proposalAddress)?.metadata;

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

            const metadata = proposalsData.get(proposalAddress)?.metadata;

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

    async updatePendingProposalData(proposalsData: ProposalsData, nftHolders: NftHolders) {
        
        console.log(`updatePendingProposalData started`);
        
        const proposalAddrWithMissingNftCollection = this.state.getProposalAddrWithMissingNftCollection();

        await Promise.all([...proposalAddrWithMissingNftCollection].map(async (proposalAddr) => {
            let proposalData = proposalsData.get(proposalAddr);

            if (!(proposalAddr in nftHolders)) {
                console.log(`fetching nft items data for proposalAddr ${proposalAddr}`);
                nftHolders[proposalAddr] = await TonVoteSdk.getAllNftHolders(this.client4, proposalData!.metadata);
            } else {
                console.log(`nft items already exist in nftHolder for collection ${proposalAddr}, skiping fetching data proposalAddr ${proposalAddr}`);
            }

            console.log(`updatePendingProposalData: updating nft holders for proposal ${proposalAddr}: `, nftHolders[proposalAddr]);
            this.state.deleteProposalAddrFromMissingNftCollection(proposalAddr);
        }));  
        
        return nftHolders;
    }

    async updateProposalVotingData(proposalsData: ProposalsData, nftHolders: NftHolders): Promise<ProposalsData> {

        console.log(`updateProposalVotingData started`);
        
        await Promise.all([...this.proposalsByState.active, ...this.proposalsByState.ended].map(async (proposalAddr) => {

            if (this.proposalsByState.ended.has(proposalAddr) && (proposalAddr in this.fetchUpdate)) {
                return;
            }

            let proposalData = proposalsData.get(proposalAddr);
            let proposalVotingData = proposalData!.votingData;

            if (!proposalData) {
                console.log(`unexpected error: proposalAddr ${proposalAddr} was not found on proposalData`);
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
                        
            let newVotingPower = await TonVoteSdk.getVotingPower(this.client4, proposalData.metadata, newTx.allTxns, proposalVotingData.votingPower, proposalData.metadata.votingPowerStrategies[0].type, nftHolders[proposalAddr]);
            let newProposalResults = TonVoteSdk.getCurrentResults(newTx.allTxns, newVotingPower, proposalData.metadata);

            proposalVotingData.proposalResult = newProposalResults;
            proposalVotingData.txData = newTx;
            proposalVotingData.votes = newVotes;
            proposalVotingData.votingPower = newVotingPower;

            proposalData.votingData = proposalVotingData;
            proposalsData.set(proposalAddr, proposalData!);

            console.log('setting new proposalData: ', proposalData);
            
            this.fetchUpdate[proposalAddr] = Date.now();

        }));

        return proposalsData;

    }

    async run() {

        try {

            if (!this.finished) {
                console.log('skipping run, still featching ...');            
                return;
            }

            this.finished = false;

            let {daosData, proposalsData, nftHolders} = this.getState();

            daosData = await this.updateDaos(daosData);
            
            ({daosData, proposalsData} = await this.updateDaosProposals(daosData, proposalsData));

            this.updateProposalsState(proposalsData);

            nftHolders = await this.updatePendingProposalData(proposalsData, nftHolders);

            proposalsData = await this.updateProposalVotingData(proposalsData, nftHolders);
            
            this.setState(daosData, proposalsData, nftHolders);
            this.finished = true;

        } catch (error) {

            this.finished = true;            
            console.log('unexpected error: ', (error as Error).stack);
        }
    }

    getFetchUpdateTime(proposalAddress: string) {
        return this.fetchUpdate[proposalAddress];
    }
}