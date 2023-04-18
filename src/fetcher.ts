import * as TonVoteSdk from "ton-vote-sdk";
import { TonClient, TonClient4 } from "ton";
import { State } from "./state";
import { MetadataArgs, DaoRoles } from "ton-vote-sdk";
import { ProposalsByState } from "./types";


// import {TxData, VotingPower, Votes, ProposalResults, ProposalInfo} from "./types";
// import * as Logger from './logger';

const DAOS_BATCH_SIZE = 100;
const PROPOSALS_BATCH_SIZE = 100;


export class Fetcher {

    private client!: TonClient;
    private client4!: TonClient4;
    private state: State;
    private fetchUpdate: number = Date.now();
    finished: boolean = true;
    proposalsByState: ProposalsByState = {pending: new Set(), active: new Set(), ended: new Set()};

    constructor(state: State) {
        this.state = state;
    }

    async init() {
        this.client = await TonVoteSdk.getClientV2();
        this.client4 = await TonVoteSdk.getClientV4();

        await this.updateRegistry();
        console.log(this.state);
        console.log(this.client4);

        // const proposalInfo = await TonVoteSdk.getProposalMetadata(this.client, this.client4);
        // this.state.setProposalInfo(proposalInfo);
    }

    async updateRegistry() {
        const registry = await TonVoteSdk.getRegistry(this.client);
        this.state.setRegistry(registry);
    }

    async updateDaos() {
        
        const daosData = this.state.getDaosData()

        console.log(`daosData.nextDaoId = ${daosData.nextDaoId}`);
        
        let newDaos = await TonVoteSdk.getDaos(this.client, daosData.nextDaoId, DAOS_BATCH_SIZE, 'asc');
        
        if (newDaos.daoAddresses.length == 0) return;

        console.log(`${newDaos.daoAddresses.length} new daos will be added: `, newDaos.daoAddresses);

        await Promise.all(newDaos.daoAddresses.map(async (daoAddress) => {
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

        this.state.setDaosData(daosData); 
    }
    
    async updateDaosProposals() {
        
        const daosData = this.state.getDaosData()
        const proposalsData = this.state.getProposalsData();
        console.log(`updateDaosProposals: proposalsData=`, proposalsData);

        await Promise.all(Array.from(daosData.daos.entries()).map(async ([daoAddress, daoData]) => {
            console.log(`fetching proposals for dao ${daoAddress}`);
            
            const newProposals = await TonVoteSdk.getDaoProposals(this.client, daoAddress, daoData.nextProposalId, PROPOSALS_BATCH_SIZE, 'asc');
            
            if (newProposals.proposalAddresses) {
        
                console.log(`address ${daoAddress}: ${newProposals.proposalAddresses?.length} newProposals: `, newProposals);
        
                await Promise.all(newProposals.proposalAddresses.map(async (proposalAddress) => {
                    console.log(`fetching info from proposal at address ${proposalAddress}`);                
                    const proposalMetadata = await TonVoteSdk.getProposalMetadata(this.client, this.client4, proposalAddress);
                    console.log(proposalsData, typeof (proposalsData));
                    
                    proposalsData.set(proposalAddress, {
                        daoAddress: daoAddress,
                        proposalAddress: proposalAddress,
                        metadata: proposalMetadata
                    });

                    this.proposalsByState.pending = this.proposalsByState.pending.add(proposalAddress);

                }));
        
                daoData.nextProposalId = newProposals.endProposalId;

                const sortedProposals = newProposals.proposalAddresses!.sort((a, b) => proposalsData.get(a)?.metadata.id! - proposalsData.get(b)?.metadata.id!);
                daoData.daoProposals = [...daoData.daoProposals, ...sortedProposals];
                daosData.daos.set(daoAddress, daoData);
        
            } else {
                console.log(`no proposals found for dao ${daoAddress}`);
            }
        }));

        this.state.setProposalsData(proposalsData);             
        this.state.setDaosData(daosData);             
    }

    updateProposalsState() {

        const proposalsData = this.state.getProposalsData();
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

    async updateProposalVotingData() {

        const proposalsData = this.state.getProposalsData();
        
        await Promise.all([...this.proposalsByState.active].map(async (proposalAddr) => {
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

            // console.log(`tx for ${proposalAddr}: `, newTx);
            
            if (newTx.maxLt == proposalVotingData.txData.maxLt) {
                console.log(`Nothing to fetch for proposal at ${proposalAddr}`);
                this.fetchUpdate = Date.now();
                return;
            }
            
            newTx.allTxns = [...newTx.allTxns, ...proposalVotingData.txData.allTxns]
            // TODO: getAllVotes - use only new tx not all of them
            let newVotes = TonVoteSdk.getAllVotes(newTx.allTxns, proposalData.metadata);
            
            let newVotingPower = await TonVoteSdk.getVotingPower(this.client4, proposalData.metadata, newTx.allTxns, proposalVotingData.votingPower);
            let newProposalResults = TonVoteSdk.getCurrentResults(newTx.allTxns, newVotingPower, proposalData.metadata);

            proposalVotingData.proposalResult = newProposalResults;
            proposalVotingData.txData = newTx;
            proposalVotingData.votes = newVotes;
            proposalVotingData.votingPower = newVotingPower;

            proposalData.votingData = proposalVotingData;
            proposalsData.set(proposalAddr, proposalData!);

            console.log('setting new proposalData: ', proposalData);
            
            this.state.setProposalData(proposalAddr, proposalData);
        }));
          
    }

    async run() {

        if (!this.finished) {
            console.log('skipping run, still featching ...');            
            return;
        }

        this.finished = false;

        this.updateDaos();

        this.updateDaosProposals();

        this.updateProposalsState();

        this.updateProposalVotingData();
        
        this.finished = true;
        this.state.setUpdateTime()
    }

    getFetchUpdateTime() {
        return this.fetchUpdate;
    }
}