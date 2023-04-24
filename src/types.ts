import { MetadataArgs, ProposalMetadata, DaoRoles, Votes, ProposalResult, TxData } from "ton-vote-contracts-sdk";


export interface VotingPower {
    [voter: string]: string
}

export type ProposalVotingData = {
    txData: TxData;
    votingPower: VotingPower;
    votes: Votes;
    proposalResult: ProposalResult;
}

export type ProposalsByState = {
    pending: Set<string>;    
    active: Set<string>;
    ended: Set<string>;
}

export type ProposalAddrWithMissingNftCollection = Set<string>

export type ProposalsData = Map<string, {
        daoAddress: string,
        proposalAddress: string, 
        metadata: ProposalMetadata,
        votingData?: ProposalVotingData
}>

export interface NftHolders {
    [nftCollectionAddress: string] : Set<string>
}

export interface DaosData {
    nextDaoId: number,
    daos: Map<string, {
        daoAddress: string,
        daoId: number,
        daoMetadata: MetadataArgs,
        daoRoles: DaoRoles,
        nextProposalId: number, 
        daoProposals: string[]
    }>
}
