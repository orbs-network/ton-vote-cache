import { TxData, VotingPower, ProposalInfo, DaoCatalog, ProposalCatalog, ProposalBundle } from "./types";
import { Votes, ProposalResult } from "ton-vote-sdk";
// import * as Logger from './logger';


const DAO_PAGINATION_SIZE = 10; // TODO: FIXME increase pagination
const PROPOSALS_PAGINATION_SIZE = 10; // TODO: FIXME increase pagination


export class State {

    private proposalBundle: ProposalBundle = {};
    private txData: TxData = { allTxns: [], maxLt: undefined };
    private votingPower: VotingPower = {};
    private votes: Votes = {};
    private proposalResults: ProposalResult | undefined;
    private proposalInfo: ProposalInfo | undefined;
    private updateTime: Number | undefined;
    private daoCatalog: DaoCatalog = { nextDaoId: 0, daos: new Map() };
    private proposalCatalog: ProposalCatalog = {};
    private registry!: string;

    getState() {

        return {
            daoCatalog: this.daoCatalog,
            votes: this.votes,
            proposalResults: this.proposalResults,
            votingPower: this.votingPower,
            maxLt: this.txData.maxLt
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

    getProposalBundle() {
        return this.proposalBundle;
    }

    getDaos(startIndex: number) {

        const daos = this.daoCatalog.daos;

        if (startIndex >= daos.size) return [];

        const endIndex = Math.min(daos.size, startIndex + DAO_PAGINATION_SIZE);
        const daosSlice = Array.from(daos.values()).slice(startIndex, endIndex);

        return {
            nextId: endIndex,
            daos: daosSlice
        };
    }

    getDaoByAddress(daoAddress: string) {

        const daos = this.daoCatalog.daos;

        if (!daos.has(daoAddress)) return {};
        return daos.get(daoAddress);
    }

    getProposals(daoAddress: string, startIndex: number) {

        if (!this.proposalCatalog[daoAddress]) return [];

        const proposals = this.proposalCatalog[daoAddress].proposals;

        if (!proposals) return [];
        if (startIndex >= proposals.size) return [];

        const endIndex = Math.min(proposals.size, startIndex + PROPOSALS_PAGINATION_SIZE);
        const proposalsSlice = Array.from(proposals.values()).slice(startIndex, endIndex);

        return {
            nextId: endIndex,
            proposals: proposalsSlice
        };

    }

    getProposal(daoAddress: string, proposalAddress: string) {

        if (!this.proposalCatalog[daoAddress]) return {};
        
        const proposals = this.proposalCatalog[daoAddress].proposals;

        if (!proposals.has(proposalAddress)) return {};
        return proposals.get(proposalAddress);
    }

    getProposalResults(proposalAddress: string) {
        if (!this.proposalBundle[proposalAddress]) return {};        
        return this.proposalBundle[proposalAddress].proposalResult;
    }

    getProposalVotes(proposalAddress: string) {
        if (!this.proposalBundle[proposalAddress]) return {};        
        return this.proposalBundle[proposalAddress].votes;
    }

    getProposalVotingPower(proposalAddress: string) {
        if (!this.proposalBundle[proposalAddress]) return {};        
        return this.proposalBundle[proposalAddress].votingPower;
    }

    getNumDaos() {
        return this.daoCatalog.daos.size;
    }

    getRegistry() {
        return this.registry;
    }

    getStateUpdateTime() {
        return this.updateTime;
    }

    getMaxLt() {
        return this.txData.maxLt;
    }

    setRegistry(registry: string) {
        this.registry = registry;
    }

    setDaoCatalog(daoCatalog: DaoCatalog) {
        this.daoCatalog = { ...daoCatalog };
    }

    setProposalCatalog(proposalCatalog: ProposalCatalog) {
        this.proposalCatalog = { ...proposalCatalog };
    }

    setProposalBundle(proposalAddr: string, newTx: TxData, newVotes: Votes, newVotingPower: VotingPower, newProposalResult: ProposalResult) {
        this.proposalBundle[proposalAddr].txData = newTx;
        this.proposalBundle[proposalAddr].votes = newVotes;
        this.proposalBundle[proposalAddr].votingPower = newVotingPower;
        this.proposalBundle[proposalAddr].proposalResult = newProposalResult;
    }
}