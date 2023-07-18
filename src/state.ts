import { DaosData, NftHolders, ProposalsData, ProposalVotingData } from "./types";
import { ProposalMetadata } from "ton-vote-contracts-sdk";
// import * as Logger from './logger';
import _ from 'lodash';


export class State {

    private updateTime: Number | undefined;
    private daosData: DaosData = { nextDaoId: 0, daos: new Map() };
    private proposalsData: ProposalsData = new Map();
    private nftHolders: NftHolders = {};
    private registry!: string;

    getDaosData() {
        return this.daosData
    }

    getProposalsData() {
        return this.proposalsData;
    }

    getNftHolders() {
        return this.nftHolders;
    }

    getProposalNftHolders(proposalAddress: string) {
        return this.nftHolders[proposalAddress] || {};
    }

    getDaos() {
        return Array.from(this.daosData.daos.values());
    }

    getDaoByAddress(daoAddress: string) {

        const daos = this.daosData.daos;

        if (!daos.has(daoAddress)) return {};
        return daos.get(daoAddress);
    }

    getProposal(proposalAddress: string) {

        const proposal = this.proposalsData.get(proposalAddress);
        if (!proposal) return {};
        
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

    getMaxLt(proposalAddress: string) {

        const proposal = this.proposalsData.get(proposalAddress);
        if (!proposal) return {};
        
        return proposal.votingData?.txData.maxLt
    }

    getNumDaos() {
        return this.daosData.daos.size;
    }

    getRegistry() {
        return this.registry;
    }

    getUpdateTime() {
        return this.updateTime;
    }

    setRegistry(registry: string) {
        this.registry = registry;
    }

    setDaosData(daosData: DaosData) {
        this.daosData = _.cloneDeep(daosData);
    }

    setProposalData(proposalAddress: string, proposalData: {
        daoAddress: string,
        proposalAddress: string, 
        metadata: ProposalMetadata,
        votingData?: ProposalVotingData}) {

        this.proposalsData.set(proposalAddress, proposalData);
    }

    setNftHolders(nftHolders: NftHolders) {
        this.nftHolders = _.cloneDeep(nftHolders);
    }

    setProposalsData(proposalsData: ProposalsData) {
        this.proposalsData = _.cloneDeep(proposalsData);
    }

    setUpdateTime() {
        return this.updateTime = Date.now();
    }

}