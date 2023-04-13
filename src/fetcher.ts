import * as TonVoteSdk from "ton-vote-sdk";
import { TonClient, TonClient4 } from "ton";
import {State} from "./state";
import { MetadataArgs, DaoRoles, ProposalMetadata } from "ton-vote-sdk";
import {ProposalsByState} from "./types";


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
        
        const daoCatalog = this.state.getDaoCatalog()
        const proposalCatalog = this.state.getProposalCatalog()

        console.log(`daoCatalog.nextDaoId = ${daoCatalog.nextDaoId}`);
        
        let newDaos = await TonVoteSdk.getDaos(this.client, daoCatalog.nextDaoId, DAOS_BATCH_SIZE, 'asc');
        
        if (newDaos.daoAddresses.length == 0) return;

        console.log(`${newDaos.daoAddresses.length} new daos will be added: `, newDaos.daoAddresses);

        await Promise.all(newDaos.daoAddresses.map(async (daoAddress) => {
            const daoMetadata = await TonVoteSdk.getDaoMetadata(this.client, daoAddress);  
            const daoRoles = await TonVoteSdk.getDaoRoles(this.client, daoAddress);
            const daoId = await TonVoteSdk.getDaoIndex(this.client, daoAddress);
          
            daoCatalog.daos.set(daoAddress, {
              daoAddress: daoAddress,
              daoId: daoId,
              daoMetadata: daoMetadata,
              daoRoles: daoRoles,
            });
            
            proposalCatalog[daoAddress] = {nextId: 0, proposals: new Map()}

        }));

        daoCatalog.nextDaoId = newDaos.endDaoId;
        const sortedDaos = new Map<string, {
            daoAddress: string,
            daoId: number,
            daoMetadata: MetadataArgs,
            daoRoles: DaoRoles
        }>(Array.from(daoCatalog.daos.entries()).sort((a, b) => a[1].daoId - b[1].daoId));
                
        daoCatalog.daos = sortedDaos;

        this.state.setDaoCatalog(daoCatalog); 
        this.state.setProposalCatalog(proposalCatalog);
    }
    
    async updateDaosProposals() {
        
        const proposalCatalog = this.state.getProposalCatalog();
        console.log(`updateDaosProposals: proposalCatalog=`, proposalCatalog);

        await Promise.all(Object.keys(proposalCatalog).map(async (daoAddress) => {
            console.log(`fetching proposals for dao ${daoAddress}`);
            
            const newProposals = await TonVoteSdk.getDaoProposals(this.client, daoAddress, proposalCatalog[daoAddress].nextId, PROPOSALS_BATCH_SIZE, 'asc');
            
            if (newProposals.proposalAddresses) {
        
                console.log(`address ${daoAddress}: ${newProposals.proposalAddresses?.length} newProposals: `, newProposals);
        
                await Promise.all(newProposals.proposalAddresses.map(async (proposalAddress) => {
                    console.log(`fetching info from proposal at address ${proposalAddress}`);                
                    const proposalMetadata = await TonVoteSdk.getProposalMetadata(this.client, this.client4, proposalAddress);
                    proposalCatalog[daoAddress].proposals.set(proposalAddress, {
                        proposalAddr: proposalAddress,
                        metadata: proposalMetadata
                    });

                    this.proposalsByState.pending = this.proposalsByState.pending.add(proposalCatalog[daoAddress].proposals.get(proposalAddress)!);

                }));
        
                proposalCatalog[daoAddress].nextId = newProposals.endProposalId;            

                const sortedProposals = new Map<string, {
                    proposalAddr: string,
                    metadata: ProposalMetadata,
                }>(Array.from(proposalCatalog[daoAddress].proposals.entries()).sort((a, b) => a[1].metadata.id - b[1].metadata.id));
                        
                proposalCatalog[daoAddress].proposals = sortedProposals;
        
        
            } else {
                console.log(`no proposals found for dao ${daoAddress}`);
            }
        }));

        this.state.setProposalCatalog(proposalCatalog);             
    }

    updateProposalsState() {

        this.proposalsByState.pending.forEach(o => {
            
            if (o.metadata.proposalStartTime <= Date.now() && o.metadata.proposalEndTime >= Date.now()) {
                this.proposalsByState.active.add(o);
                this.proposalsByState.pending.delete(o);
            }

            if (o.metadata.proposalStartTime <= Date.now() && o.metadata.proposalEndTime <= Date.now()) {
                this.proposalsByState.ended.add(o);
                this.proposalsByState.pending.delete(o);
            }

        }); 

        console.log(this.proposalsByState);
        
    }

    async updateProposalBundle() {

        const proposalBundle = this.state.getProposalBundle();

        await Promise.all([...this.proposalsByState.active].map(async (o) => {
            const proposalAddr = o.proposalAddr;

            if (!proposalBundle[proposalAddr]) {
                proposalBundle[proposalAddr] = {
                    txData: {allTxns: [], maxLt: undefined},
                    votingPower: {},
                    votes: {},
                    proposalResult: {yes: 0, no: 0, abstain: 0, totalWeight: '0'}
                }
            }

            const newTx = await TonVoteSdk.getTransactions(this.client, proposalAddr, proposalBundle[proposalAddr].txData.maxLt);

            console.log(`tx for ${proposalAddr}: `, newTx);
            
            if (newTx.maxLt == proposalBundle[proposalAddr].txData.maxLt) {
                console.log(`Nothing to fetch for proposal at ${proposalAddr}`);
                this.fetchUpdate = Date.now();
                return;
            }

            newTx.allTxns = [...newTx.allTxns, ...proposalBundle[proposalAddr].txData.allTxns]
            // TODO: getAllVotes - use only new tx not all of them
            let newVotes = TonVoteSdk.getAllVotes(newTx.allTxns, o.metadata);
            
            let newVotingPower = await TonVoteSdk.getVotingPower(this.client4, o.metadata, newTx.allTxns, proposalBundle[proposalAddr].votingPower);
            let newProposalResults = TonVoteSdk.getCurrentResults(newTx.allTxns, newVotingPower, o.metadata);

            this.state.setProposalBundle(proposalAddr, newTx, newVotes, newVotingPower, newProposalResults);
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

        this.updateProposalBundle();
        
        this.finished = true;

        // const {txData, votingPower, proposalInfo} = this.state.getFullState();

        // let newTxData = await this.getTransactions(txData);
        
        // if (newTxData.toLt == txData.toLt) {
        //     Logger.log(`Nothing to fetch`);
        //     this.fetchUpdate = Date.now();
        //     return;
        // }

        // if (proposalInfo == undefined) throw Error('proposalInfo was not updated');

        // let newVotes = this.getAllVotes(proposalInfo, newTxData.tx);
        
        // let newVotingPower = await this.getVotingPower(proposalInfo, newTxData.tx, votingPower);
        // let newProposalResults = await this.getCurrentResults(proposalInfo, newTxData.tx, newVotingPower);

        // this.state.setState(newTxData, newVotingPower, newVotes, newProposalResults);
        // this.fetchUpdate = Date.now();
    }

    getFetchUpdateTime() {
        return this.fetchUpdate;
    }

    // async getTransactions(txData: TxData) : Promise<{ tx: any; toLt: string; }> {
    //     let res = await TonVoteSdk.getTransactions(this.client, txData.toLt);
    //     return {
    //         tx: [...res.allTxns, ...txData.tx], 
    //         toLt: res.maxLt
    //     } ;
    // }
   
    // getAllVotes(proposalInfo: ProposalInfo, transactions: []): Votes {
    //     return TonVoteSdk.getAllVotes(transactions, proposalInfo) as Votes;
    // }
    
    // async getVotingPower(proposalInfo: ProposalInfo, transactions: [], votingPower: VotingPower): Promise<VotingPower> {
    //     return TonVoteSdk.getVotingPower(this.client4, proposalInfo, transactions, votingPower);
    // }
    
    // async getCurrentResults(proposalInfo: ProposalInfo, transactions: [], votingPower: VotingPower) : Promise<ProposalResults>{
    //     return TonVoteSdk.getCurrentResults(transactions, votingPower, proposalInfo)
    // }
}