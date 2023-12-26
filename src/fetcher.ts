import * as TonVoteSdk from "ton-vote-contracts-sdk";
import { TonClient, TonClient4 } from "ton";
import { State } from "./state";
import { MetadataArgs, DaoRoles, ReleaseMode, VotingPowerStrategyType } from "ton-vote-contracts-sdk";
import { DaosData, NftHolders, ProposalsWithMissingData, ProposalsByState, ProposalsData, ProposalFetchingErrorReason, FetcherStatus, ProposalState, OperatingValidatorsInfo } from "./types";
import dotenv from 'dotenv';
import _ from 'lodash';
import { getOrderedDaosByPriority, getProposalState, isValidAddress, replacer, reviver, sendNotification } from "./helpers";
import fs from 'fs';
import {log, error} from './logger';
import fetch from 'node-fetch';
import { getConfigProposalResults } from "./validators/validators-config";
// import { getHttpV4Endpoint } from "@orbs-network/ton-access";


dotenv.config();

const DAOS_BATCH_SIZE = 5; 
const PROPOSALS_BATCH_SIZE = 3;

const UPDATE_DAOS_BATCH_SIZE = 5;
const PROPOSAL_METADATA_BATCH_SIZE = 3;

const PROPOSALS_VOTING_DATA_BATCH_SIZE = 3;

const RELEASE_MODE = Number(process.env.RELEASE_MODE) as ReleaseMode

const TON_VOTE_DB_PATH = process.env.TON_VOTE_DB_PATH || '/tmp/ton-vote-db'
const OPERATING_VALIDATORS_ENDPOINT = 'https://single-nominator-backend.herokuapp.com/operatingValidatorsBalance';

if (!fs.existsSync(TON_VOTE_DB_PATH)) {
    fs.mkdirSync(TON_VOTE_DB_PATH);
    log(`${TON_VOTE_DB_PATH} directory was created successfully`);
}

export class Fetcher {

    private client!: TonClient;
    private client4!: TonClient4;
    private state: State;
    private fetchUpdate: {[proposalAddress: string]: number} = {};
    private proposalsByState: ProposalsByState = {pending: new Set(), active: new Set(), ended: new Set()};

    private daosData!: DaosData;
    private proposalsData!: ProposalsData;
    private nftHolders!: NftHolders;
    private operatingValidatorsInfo!: OperatingValidatorsInfo;

    private proposalsWithMissingData: ProposalsWithMissingData = {};

    private status: FetcherStatus = 'Init';

    constructor(state: State) {
        this.state = state;
    }

    async init() {
        await sendNotification('Ton Vote Cache Server started');        
        
        // this.client = new TonClient({endpoint: "http://192.96.205.37/1/mainnet/toncenter-api-v2/jsonRPC"}) // wa1
        // this.client = new TonClient({endpoint: "http://207.244.121.118/1/mainnet/toncenter-api-v2/jsonRPC"}) // 500 wa2
        // this.client = await TonVoteSdk.getClientV2();
        this.client = new TonClient({endpoint: "http://107.6.173.98/1/mainnet/toncenter-api-v2/jsonRPC"}) // working am3
        // console.log(this.client);
        
        // this.client = new TonClient({endpoint: 'https://mainnet.tonhubapi.com/jsonRPC'}); 

        const endpointV4 = undefined; // await getHttpV4Endpoint();
        // const endpointV4 = "https://mainnet-v4.tonhubapi.com"; 

        this.client4 = await TonVoteSdk.getClientV4(endpointV4);

        log(`starting with masterchainInfo: ${JSON.stringify(await this.client.getMasterchainInfo())}`)
        await this.updateRegistry();

        this.getState();
        this.readLocalDb();        
    }

    readLocalDb() {

        try {
          const fileNames = fs.readdirSync(TON_VOTE_DB_PATH);
          
          fileNames.forEach((fileName) => {
            
            const filePath = `${TON_VOTE_DB_PATH}/${fileName}`;
            
            try {
              const fileContents = fs.readFileSync(filePath, 'utf8');
              const jsonData = JSON.parse(fileContents, reviver);
        
              log(`Extrated data from ${fileName}`);
                                          
              this.proposalsData.set(fileName.replace('.json', ''), jsonData);

            } catch (err) {
              error(`Error reading or parsing file ${fileName}: ${err}`);
            }

          });

        } catch (err) {
          error(`Error reading the directory: ${err}`);
        }

        this.state.setProposalsData(this.proposalsData);                        
    }

    async updateRegistry() {

        const registry = await TonVoteSdk.getRegistry(this.client, RELEASE_MODE);
        log(`registry: ${registry}`);
        
        if (!registry) throw('Please deploy registry before starting ton vote cache server');
        
        this.state.setRegistry(registry);
    }

    getState() {
        this.daosData = _.cloneDeep(this.state.getDaosData());
        this.proposalsData = _.cloneDeep(this.state.getProposalsData());
        this.nftHolders = _.cloneDeep(this.state.getNftHolders());
        this.operatingValidatorsInfo = _.cloneDeep(this.state.getOperatingValidatorsInfo());
    }

    async setState() {
        this.state.setDaosData(this.daosData);
        this.state.setProposalsData(this.proposalsData);
        this.state.setNftHolders(this.nftHolders); 
        this.state.setOperatingValidatorsInfo(this.operatingValidatorsInfo); 
        this.state.setUpdateTime()
    }

    async fetchNewDaos() {
        
        log(`fetchNewDaos started`);
        
        log(`daosData.nextDaoId = ${this.daosData.nextDaoId}`);
        
        let newDaos = await TonVoteSdk.getDaos(this.client, RELEASE_MODE, this.daosData.nextDaoId, DAOS_BATCH_SIZE);
        
        if (newDaos.daoAddresses.length == 0) return;

        log(`${newDaos.daoAddresses.length} new daos will be added: ${newDaos.daoAddresses}`);

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
            
            log(`inserting daoState and metadata for dao at address ${daoAddress}`);
            
            this.daosData.daos.set(daoAddress, {
              daoAddress: daoAddress,
              daoId: daoState.daoIndex,
              daoMetadata: {metadataAddress: daoState.metadata, metadataArgs: metadataArgs},
              daoRoles: {owner: daoState.owner, proposalOwner: daoState.proposalOwner},
              nextProposalId: 0,
              daoProposals: []
            });
          }));
        
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
            await TonVoteSdk.sleep(5000);
        }
    }

    async fetchDaosState() {
        log(`fetchDaosState started`);
    
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
    
                log(`fetching new Dao Metadata for ${daoAddress} ...`);
    
                const metadataArgs = await TonVoteSdk.getDaoMetadata(this.client, daoState.metadata);
    
                let daoToUpdate = this.daosData.daos.get(daoAddress);
                daoToUpdate!.daoMetadata = {metadataAddress: daoState.metadata, metadataArgs: metadataArgs};
                daoToUpdate!.daoRoles = {owner: daoState.owner, proposalOwner: daoState.proposalOwner};
    
                log(`Dao Metadata for ${daoAddress} was updated successfully`);
            }));
    
            // handle individual results
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    error(`Failed to process daoAddress at index ${index} with reason: ${result.reason}`);
                }
            });
            await TonVoteSdk.sleep(5000);
        }
    }
      
    async fetchNewProposals() {

        log(`fetchNewProposals started`);

        const daos = Array.from(this.daosData.daos.entries());
        const daoBatchSize = DAOS_BATCH_SIZE;
        const daoBatches = [];
        
        for (let i = 0; i < daos.length; i += daoBatchSize) {
            daoBatches.push(daos.slice(i, i + daoBatchSize));
        }
        
        for (const daoBatch of daoBatches) {
            
            await Promise.all(daoBatch.map(async ([daoAddress, daoData]) => {
                
                log(`fetching proposals for dao ${daoAddress}`);
                const newProposals = await TonVoteSdk.getDaoProposals(this.client, daoAddress, daoData.nextProposalId, PROPOSALS_BATCH_SIZE, 'asc');
                
                if (newProposals.proposalAddresses) {
                    
                    log(`Dao at address ${daoAddress}: ${newProposals.proposalAddresses?.length} newProposals: ${JSON.stringify(newProposals)}`);
                    const allPromises: Promise<void>[] = [];
                    const chunks = [];
                    const proposalAddresses = newProposals.proposalAddresses;
                    const batchSize = PROPOSAL_METADATA_BATCH_SIZE;
                    
                    for (let i = 0; i < proposalAddresses.length; i += batchSize) {
                        chunks.push(proposalAddresses.slice(i, i + batchSize));
                    }
        
                    for (const chunk of chunks) {
                        chunk.forEach(proposalAddress => {

                            // handle case of proposal loaded from json
                            if (this.proposalsData.has(proposalAddress)) {
                                this.fetchUpdate[proposalAddress] = Date.now();
                                let proposalState = getProposalState(proposalAddress, this.proposalsData.get(proposalAddress)?.metadata!)                                
                                if (proposalState == ProposalState.pending) this.proposalsByState.pending = this.proposalsByState.pending.add(proposalAddress);
                                else if (proposalState == ProposalState.active) this.proposalsByState.active = this.proposalsByState.active.add(proposalAddress);
                                else if (proposalState == ProposalState.ended) this.proposalsByState.ended = this.proposalsByState.ended.add(proposalAddress);                                
                                return;
                            }
                            
                            if (this.status != 'Init') sendNotification(`new proposal was created ${proposalAddress}`);

                            const promise = (async () => {
                                log(`fetching info from proposal at address ${proposalAddress}`);
                                const proposalMetadata = await TonVoteSdk.getProposalMetadata(this.client, this.client4, proposalAddress);
                                this.proposalsData.set(proposalAddress, {
                                    daoAddress: daoAddress,
                                    proposalAddress: proposalAddress,
                                    metadata: proposalMetadata
                                });

                                this.proposalsByState.pending = this.proposalsByState.pending.add(proposalAddress);

                                if (!(proposalAddress in this.proposalsWithMissingData)) this.proposalsWithMissingData[proposalAddress] = new Set();
                                this.proposalsWithMissingData[proposalAddress].add(proposalMetadata.votingPowerStrategies[0].type);

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
                    log(`no proposals found for Dao at address ${daoAddress}`);
                }

            }));
            await TonVoteSdk.sleep(2000);
        }               
    }

    async fetchProposalsMetadata() {

        log(`fetchProposalsMetadata started`);

        const pendingProposalsArray = [...this.proposalsByState.pending];
        const batchSize = 50;
        
        while (pendingProposalsArray.length > 0) {
          const batch = pendingProposalsArray.splice(0, Math.min(batchSize, pendingProposalsArray.length));
        
          await Promise.all(batch.map(async (proposalAddress) => {
            const proposalMetadata = await TonVoteSdk.getProposalMetadata(this.client, this.client4, proposalAddress);
        
            if (_.isEqual(proposalMetadata, this.proposalsData.get(proposalAddress)?.metadata)) return;
        
            log(`proposal metadata at ${this.proposalsData.get(proposalAddress)?.metadata} was changed`);
        
            this.proposalsData.set(proposalAddress, {
              daoAddress: this.proposalsData.get(proposalAddress)?.daoAddress!,
              proposalAddress: proposalAddress,
              metadata: proposalMetadata
            });
          }));
          await TonVoteSdk.sleep(2000);
        }                            
    }


    updateProposalsState() {

        log(`updateProposalsState started`);

        const now = Date.now() / 1000;

        this.proposalsByState.pending.forEach(proposalAddress => {
            
            const metadata = this.proposalsData.get(proposalAddress)?.metadata;

            if (!metadata) {
                log(`unexpected error: could not find metadata at proposal ${proposalAddress}`);
                return;                
            }

            if (metadata.proposalStartTime <= now && metadata.proposalEndTime >= now) {                
                this.proposalsByState.active.add(proposalAddress);
                this.proposalsByState.pending.delete(proposalAddress);
                log(`proposal ${proposalAddress} was moved to active proposals`);
            }

            else if (metadata.proposalStartTime <= now && metadata.proposalEndTime <= now) {
                this.proposalsByState.ended.add(proposalAddress);
                this.proposalsByState.pending.delete(proposalAddress);
                log(`proposal ${proposalAddress} was moved to ended proposals`);
            }
        }); 

        this.proposalsByState.active.forEach(proposalAddress => {

            const metadata = this.proposalsData.get(proposalAddress)?.metadata;

            if (!metadata) {
                log(`unexpected error: could not find metadata at proposal ${proposalAddress}`);
                return;                
            }

            if (metadata.proposalStartTime <= now && metadata.proposalEndTime <= now) {
                this.proposalsByState.ended.add(proposalAddress);
                this.proposalsByState.active.delete(proposalAddress);
                log(`proposal ${proposalAddress} was moved to ended proposals`);
            }

        });         

        console.log(this.proposalsByState);
    }

    async fetchMissingData() {
        
        log(`fetchMissingData started`);
               
        for (const proposalAddr in this.proposalsWithMissingData) {
            console.log(`fetching missing data for proposal ${proposalAddr}`);

            const nextValue = this.proposalsWithMissingData[proposalAddr].values().next().value;
            const votingPowerStrategyType = Number(nextValue) as VotingPowerStrategyType;
            let proposalData = this.proposalsData.get(proposalAddr);
        
            switch (votingPowerStrategyType) {

                case VotingPowerStrategyType.NftCcollection:
                case VotingPowerStrategyType.NftCcollection_1Wallet1Vote:

                    if (!(proposalAddr in this.nftHolders)) {
                        try {
                            log(`fetching nft items data for proposalAddr ${proposalAddr}`);
                            this.nftHolders[proposalAddr] = await TonVoteSdk.getAllNftHolders(this.client4, proposalData!.metadata);
                        } catch (error) {
                            log(`failed to fetch nft items for proposal ${proposalAddr}: ${error}`);
                            proposalData!.fetchErrorReason = ProposalFetchingErrorReason.FETCH_NFT_ERROR;
                            this.proposalsData.set(proposalAddr, proposalData!);
                            continue;
                        }
                    } else {
                        log(`nft items already exist in nftHolder, skipping fetching data proposalAddr ${proposalAddr}`);
                    }
                
                    break;

                case VotingPowerStrategyType.TonBalanceWithValidators:
                    let response = await fetch(OPERATING_VALIDATORS_ENDPOINT, {timeout: 60000});                    
                    const res = await response.json();
                    
                    const addressKeys = Object.keys(res).filter((key) => isValidAddress(key));
                    
                    const addressObjects: any = {};
                    addressKeys.forEach((key) => {
                      addressObjects[key] = res[key];
                    });
                                                              
                    this.operatingValidatorsInfo[proposalAddr] = addressObjects;
                    break;

                default:
                    console.log(`skipping unknown missing data type: ${votingPowerStrategyType}`);
                    
            }
            
            await TonVoteSdk.sleep(2000);

            console.log(`deleting ${proposalAddr} from proposalsWithMissingData ...`);
            
            this.proposalsWithMissingData[proposalAddr].delete(nextValue);            
            if (this.proposalsWithMissingData[proposalAddr].size == 0) delete this.proposalsWithMissingData[proposalAddr];

            console.log(this.proposalsWithMissingData);
            
        }
    }

    // async fetchValidatorsProposalData(proposalData: SingleProposalData) {
    //     const res = await getConfigProposalResults(this.client4, proposalData);
    //     return res;
    // }

    async processInBatches<T>(
        array: T[],
        batchSize: number,
        callback: (item: T) => Promise<void>
      ): Promise<void> {
        const batchCount = Math.ceil(array.length / batchSize);
        const results: PromiseSettledResult<void>[] = [];
      
        for (let i = 0; i < batchCount; i++) {
          const batchPromises = array
            .slice(i * batchSize, (i + 1) * batchSize)
            .map(callback);
      
          const settledBatch = await Promise.allSettled(batchPromises);
          results.push(...settledBatch);
          await TonVoteSdk.sleep(2000); 
        }
      
        const failedPromises = results.filter(result => result.status === 'rejected');
      
        if (failedPromises.length > 0) {
          console.log('Failed Promises:');
          failedPromises.forEach((result, index) => {
            if ('reason' in result && result.reason !== undefined) {
              console.log(`Promise ${index + 1}:`, result.reason);
            } else {
              console.log(`Promise ${index + 1}: Rejected with no reason provided`);
            }
          });
        }

    }
            
    // TODO: handle ended proposal separately
    async fetchProposalsVotingData() {

        log(`fetchProposalsVotingData started`);

        await this.processInBatches([...this.proposalsByState.active, ...this.proposalsByState.ended], PROPOSALS_VOTING_DATA_BATCH_SIZE, async (proposalAddr: string) => {
        
            if (this.proposalsByState.ended.has(proposalAddr) && (proposalAddr in this.fetchUpdate)) {
                return;
            }
            
            let proposalData = this.proposalsData.get(proposalAddr);

            if (!proposalData) {
                log(`unexpected error: proposalAddr ${proposalAddr} was not found on proposalData`);
                return;
            }
            
            if (proposalData.metadata.votingPowerStrategies.length && proposalData.metadata.votingPowerStrategies[0].type == VotingPowerStrategyType.ValidatorsVote) {
                await getConfigProposalResults(this.client4, proposalData);
                // const validatorsVotingData = await this.fetchValidatorsProposalData(proposalData.metadata, proposalData);
                
                // if (!validatorsVotingData || !(Object.keys(validatorsVotingData).length) ) return;
                // proposalData.validatorsVotingData = validatorsVotingData;
                // this.proposalsData.set(proposalAddr, proposalData!);
                return;
            }

            let proposalVotingData = proposalData!.votingData;


            if (proposalData!.fetchErrorReason != undefined) {
                log(`Not all data for proposal ${proposalAddr} was fetched properly, fetch error (${proposalData!.fetchErrorReason} was found), skipping voting data update`);
                return;
            }

            if (!proposalVotingData) {
                proposalVotingData = {
                    txData: {allTxns: [], maxLt: undefined},
                    votingPower: {},
                    votes: {},
                    proposalResult: {yes: 0, no: 0, abstain: 0, totalWeights: '0'}
                }
            }
            
            const newTx = await TonVoteSdk.getTransactions(this.client, proposalAddr, proposalVotingData.txData.maxLt);

            if (newTx.maxLt == proposalVotingData.txData.maxLt) {
                log(`Nothing to fetch for proposal at ${proposalAddr}`);
                this.fetchUpdate[proposalAddr] = Date.now();
                return;
            }
            
            newTx.allTxns = [...newTx.allTxns, ...proposalVotingData.txData.allTxns]
            // TODO: getAllVotes - use only new tx not all of them
            let newVotes = TonVoteSdk.getAllVotes(newTx.allTxns, proposalData.metadata);
                        
            let newVotingPower = await TonVoteSdk.getVotingPower(
                this.client4, 
                proposalData.metadata, 
                newTx.allTxns, 
                proposalVotingData.votingPower, 
                proposalData.metadata.votingPowerStrategies[0].type, 
                this.nftHolders[proposalAddr], 
                this.operatingValidatorsInfo[proposalAddr]);

            let newProposalResults = TonVoteSdk.getCurrentResults(newTx.allTxns, newVotingPower, proposalData.metadata);

            proposalVotingData.proposalResult = newProposalResults;
            proposalVotingData.txData = newTx;
            proposalVotingData.votes = newVotes;
            proposalVotingData.votingPower = newVotingPower;

            proposalData.votingData = proposalVotingData;
            this.proposalsData.set(proposalAddr, proposalData!);

            log(`setting new proposalData for proposal ${proposalAddr}`);

            if (this.proposalsByState.ended.has(proposalAddr)) {
                const filePath = TON_VOTE_DB_PATH + `/${proposalAddr}.json`;
                const jsonString = JSON.stringify(proposalData, replacer);

                fs.writeFileSync(filePath, jsonString);
            
              log(`successfully saved json data at ${filePath}`);
            }
            
            this.fetchUpdate[proposalAddr] = Date.now();
            return;
        });
    }

    writeEndedProposalToDb() {
        log(`writeEndedProposalToDb started`);
        
        [...this.proposalsByState.ended].map(proposalAddr => {

            // if (proposalAddr in this.fetchUpdate) return;

            let proposalData = this.proposalsData.get(proposalAddr);

            if (this.proposalsByState.ended.has(proposalAddr)) {
                const filePath = TON_VOTE_DB_PATH + `/${proposalAddr}.json`;
                const jsonString = JSON.stringify(proposalData, replacer);

                fs.writeFileSync(filePath, jsonString);
            
              log(`successfully saved json data at ${filePath}`);
            }
            
            this.fetchUpdate[proposalAddr] = Date.now();

        });

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
                const totalWeights = Number(votingData.proposalResult.totalWeights);
                let lastTxTime = proposalData.votingData?.txData.allTxns[0].now;
                if (!lastTxTime) continue;
                sortingScore = Math.log10(totalWeights) * Object.keys(votingData.votes).length * (Date.now() - lastTxTime);
                emaSortingScore = emaSortingScore + alpha * (sortingScore - emaSortingScore);
              }
              
            // res *= * ~ 1 / log (now - last_proposal_timestamp)
            // create_dao_date
        });

    }

    async run() {

        try {
            
            const startTime = Date.now();

            this.getState();

            await this.fetchNewDaos();
                        
            await this.fetchDaosState();

            await this.fetchNewProposals();

            await this.fetchProposalsMetadata();

            this.updateProposalsState();

            await this.fetchMissingData();

            await this.fetchProposalsVotingData();
            
            this.writeEndedProposalToDb();
            
            this.setState();

            log(`Stats: ${this.daosData.daos.size} Daos, ${this.proposalsData.size} Proposals`);
            log(`Finished in ${(Date.now()-startTime)/1000} seconds`); 
            log(`------------------------------------------------------------`);    
            
            this.status = 'Synced';

        } catch (err) {

            this.status = 'Error';
            error(`unexpected error: ${(err as Error).stack}`);
            await sendNotification(`unexpected error: ${(err as Error).stack}`);
            log(`[Error] ------------------------------------------------------------`);                       
            
            this.writeEndedProposalToDb();            
            this.setState();

            console.log('sleep for 1 min');            
            TonVoteSdk.sleep(1 * 60 * 1000);
            // this.client = await TonVoteSdk.getClientV2();
            // this.client4 = await TonVoteSdk.getClientV4();

            // this.client = new TonClient({endpoint: 'https://mainnet.tonhubapi.com/jsonRPC'}); 
            // this.client4 = await TonVoteSdk.getClientV4("https://mainnet-v4.tonhubapi.com");

            console.log(`client v2 provider: ${this.client.parameters.endpoint}`);
            
        }
    }

    getFetchUpdateTime(proposalAddress: string) {
        return this.fetchUpdate[proposalAddress];
    }

    getProposalsWithMissingData() {
        return this.proposalsWithMissingData;
    }

    getStatus() {
        return this.status;
    }

    getProposalsByState() {
        return this.proposalsByState;
    }

}