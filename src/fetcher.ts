import * as TonVoteSdk from "ton-vote-sdk";
import { TonClient, TonClient4 } from "ton";
import {State} from "./state";
// import {TxData, VotingPower, Votes, ProposalResults, ProposalInfo} from "./types";
// import * as Logger from './logger';

const DAOS_BATCH_SIZE = 100;
const PROPOSALS_BATCH_SIZE = 100;


export class Fetcher {

    private client!: TonClient;
    private client4!: TonClient4;
    private state: State;
    private fetchUpdate: Number = Date.now();

    constructor(state: State) {
        this.state = state;
    }

    async init() {
        this.client = await TonVoteSdk.getClientV2();
        this.client4 = await TonVoteSdk.getClientV4();

        await this.updateRegistry();
        console.log(this.state);
        console.log(this.client4);

        // const proposalInfo = await TonVoteSdk.getProposalInfo(this.client, this.client4);
        // this.state.setProposalInfo(proposalInfo);
    }

    async updateRegistry() {
        const registry = await TonVoteSdk.getRegistry(this.client);
        this.state.setRegistry(registry);
    }

    async updateDaos() {
        
        const daoCatalog = this.state.getDaoCatalog()
        let newDaos = await TonVoteSdk.getDaos(this.client, daoCatalog.nextDaoId, DAOS_BATCH_SIZE, 'asc');
        
        if (newDaos.daoAddresses.length == 0) return;

        console.log(`${newDaos.daoAddresses.length} new daos will be added: `, newDaos.daoAddresses);

        newDaos.daoAddresses.forEach(async (daoAddress) => {
            const daoMetadata = await TonVoteSdk.getDaoMetadata(this.client, daoAddress);  
            const daoRoles = await TonVoteSdk.getDaoRoles(this.client, daoAddress);
            const daoId = await TonVoteSdk.getDaoIndex(this.client, daoAddress);  

            daoCatalog.daos[daoAddress] = {
                daoId: daoId,
                daoMetadata: daoMetadata,
                roles: daoRoles,
                proposalCatalog: {nextId: 0, proposals: {}}
            };
        });

        daoCatalog.nextDaoId = newDaos.endDaoId;

        this.state.setDaoCatalog(daoCatalog);
    }
    
    async updateDaosProposals() {

        const daoCatalog = this.state.getDaoCatalog()

        Object.keys(daoCatalog.daos).forEach(async (daoAddress) => {
            console.log(`fetching proposals for dao ${daoAddress}`);
            
            const newProposals = await TonVoteSdk.getDaoProposals(this.client, daoAddress, daoCatalog.daos[daoAddress].proposalCatalog.nextId, PROPOSALS_BATCH_SIZE, 'asc');

            if (newProposals.proposalAddresses) {

                console.log(`address ${daoAddress}: ${newProposals.proposalAddresses?.length} newProposals: `, newProposals);

                newProposals.proposalAddresses.forEach(async (proposalAddress) => {
                    console.log(`fetching info from proposal at address ${proposalAddress}`);                
                    daoCatalog.daos[daoAddress].proposalCatalog.proposals[proposalAddress] = await TonVoteSdk.getProposalInfo(this.client, this.client4, proposalAddress);

                });

                daoCatalog.daos[daoAddress].proposalCatalog.nextId = newProposals.endProposalId;            
                
            } else {
                console.log(`no proposals found for dao ${daoAddress}`);
            }

        });

        this.state.setDaoCatalog(daoCatalog);
    }

    async run() {

        this.updateDaos();

        this.updateDaosProposals();

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