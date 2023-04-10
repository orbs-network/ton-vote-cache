import {TxData,VotingPower, Votes, ProposalResults, ProposalInfo, DaoCatalog, ProposalCatalog} from "./types";
import * as Logger from './logger';


const DAO_PAGINATION_SIZE = 10; // TODO: FIXME increase pagination
const PROPOSALS_PAGINATION_SIZE = 10; // TODO: FIXME increase pagination


export class State {

    private txData: TxData = {tx: [], toLt: undefined};
    private votingPower: VotingPower = {};
    private votes: Votes = {};
    private proposalResults: ProposalResults | undefined;
    private proposalInfo: ProposalInfo | undefined;
    private updateTime: Number | undefined;
    private daoCatalog: DaoCatalog = {nextDaoId: 0, daos: []};
    private proposalCatalog: ProposalCatalog = {};
    private registry!: string;

    getState() {

        return {
            daoCatalog: this.daoCatalog,
            votes: this.votes,
            proposalResults: this.proposalResults,
            votingPower: this.votingPower,
            maxLt: this.txData.toLt
        }
    }

    getFullState() {

        return {
            txData: this.txData,
            votingPower: this.votingPower,
            votes: this.votes,
            proposalResults: this.proposalResults,
            proposalInfo: this.proposalInfo,
            updateTime: this.updateTime
        }
    }

    getDaoCatalog() {
        return this.daoCatalog
    }

    getProposalCatalog() {
        return this.proposalCatalog;
    }


    getDaos(startIndex: number) {

        const daos = this.daoCatalog.daos;

        if (startIndex >= daos.length) return [];
        
        const daosSlice = daos.slice(startIndex, Math.min(daos.length, startIndex + DAO_PAGINATION_SIZE))

        return {
            nextId: daosSlice[daosSlice.length - 1].daoId + 1, 
            daos: daosSlice
        };
    }

    getProposals(proposalAddress: string, startIndex: number) {
        
        if (!this.proposalCatalog[proposalAddress]) return [];

        const proposals = this.proposalCatalog[proposalAddress].proposals;

        if (!proposals) return [];
        if (startIndex >= proposals.length) return [];
        
        const proposalsSlice = proposals.slice(startIndex, Math.min(proposals.length, startIndex + PROPOSALS_PAGINATION_SIZE))

        return {
            nextId: proposalsSlice[proposalsSlice.length - 1].metadata.id + 1, 
            proposals: proposalsSlice
        };

    }

    getNumDaos() {
        return this.daoCatalog.daos.length;
    }

    getRegistry() {
        return this.registry;
    }

    getStateUpdateTime() {
        return this.updateTime;
    }

    getProposalResults() {
        return this.proposalResults;
    }

    getProposalInfo() {
        return this.proposalInfo;
    }

    getMaxLt() {
        return this.txData.toLt;
    }
    
    setProposalInfo(proposalInfo: ProposalInfo) {
        this.proposalInfo = proposalInfo;
    }

    setRegistry(registry: string) {
        this.registry = registry;
    }

    setDaoCatalog(daoCatalog: DaoCatalog) {
        this.daoCatalog = {...daoCatalog};
    }

    setProposalCatalog(proposalCatalog: ProposalCatalog) {
        this.proposalCatalog = {...proposalCatalog};
    }

    setState(txData: TxData, votingPower: VotingPower, votes: Votes, proposalResults: ProposalResults) {
        Logger.log(`updating state ...`);
        
        this.txData = txData;
        this.votingPower = votingPower;
        this.votes = votes;
        this.proposalResults = proposalResults;
        this.updateTime = Date.now();
    }
}