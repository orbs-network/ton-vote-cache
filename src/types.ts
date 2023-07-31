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

export enum ProposalState {
    undefined = 0,
    pending = 1,
    active = 2,
    ended = 3
}

export type ProposalsByState = {
    pending: Set<string>;    
    active: Set<string>;
    ended: Set<string>;
}

export type ProposalAddrWithMissingNftCollection = Set<string>

export type FetcherStatus = 'Init' | 'Synced' | 'Error';

export enum ProposalFetchingErrorReason {
    FETCH_NFT_ERROR = 0
}

export type ProposalsData = Map<string, {
        daoAddress: string,
        proposalAddress: string, 
        metadata: ProposalMetadata,
        votingData?: ProposalVotingData,
        fetchErrorReason?: ProposalFetchingErrorReason
}>

export interface NftHolders {
    [proposalAddress: string] : {[nftHolderAddr: string]: string[]}
}

export interface DaosData {
    nextDaoId: number,
    daos: Map<string, {
        daoAddress: string,
        daoId: number,
        daoMetadata: {metadataAddress: string, metadataArgs: MetadataArgs},
        daoRoles: DaoRoles,
        nextProposalId: number, 
        daoProposals: string[]
    }>
}
