import { DaosData, ProposalsData, ProposalVotingData } from "./types";
import { ProposalMetadata } from "ton-vote-sdk";
// import * as Logger from './logger';


const DAO_PAGINATION_SIZE = 1000; // TODO: FIXME increase pagination


export class State {

    private updateTime: Number | undefined;
    private daosData: DaosData = { nextDaoId: 0, daos: new Map() };
    private proposalsData: ProposalsData = new Map();
    private registry!: string;

    getDaosData() {
        return this.daosData
    }

    getProposalsData() {
        return this.proposalsData;
    }

    getDaos() {

        const daos = this.daosData.daos;

        if (daos.size == 0) return {};

        const daosSlice = Array.from(daos.values()).slice(0, daos.size);
        return daosSlice.reverse()
    }

    getDaoByAddress(daoAddress: string) {

        const daos = this.daosData.daos;

        if (!daos.has(daoAddress)) return {};
        return daos.get(daoAddress);
    }

    getProposal(proposalAddress: string) {

        const proposal = this.proposalsData.get(proposalAddress);
        if (!proposal) return {};
        console.log(proposal);
        
        return proposal.votingData ? {
            daoAddress: proposal.daoAddress,
            metadata: proposal.metadata,
            votingPower: proposal.votingData.votingPower,
            votes: proposal.votingData.votes,
            proposalResult: proposal.votingData.proposalResult
        } : {
            daoAddress: proposal.daoAddress,
            metadata: proposal.metadata,
            votingPower: {},
            votes: {},
            proposalResult: {}
        }
    }

    getNumDaos() {
        return this.daosData.daos.size;
    }

    getRegistry() {
        return this.registry;
    }

    getStateUpdateTime() {
        return this.updateTime;
    }

    getMaxLt() {
        return 0 //this.txData.maxLt;
    }

    setRegistry(registry: string) {
        this.registry = registry;
    }

    setDaosData(daosData: DaosData) {
        this.daosData = { ...daosData };
    }

    setProposalData(proposalAddress: string, proposalData: {
        daoAddress: string,
        proposalAddress: string, 
        metadata: ProposalMetadata,
        votingData?: ProposalVotingData}) {

        this.proposalsData.set(proposalAddress, proposalData);
    }

    setProposalsData(proposalsData: ProposalsData) {
        this.proposalsData = proposalsData;
    }

}