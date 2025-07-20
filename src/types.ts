import { MetadataArgs, ProposalMetadata, DaoRoles, Votes, ProposalResult, TxData, VotingPowerStrategyType } from "ton-vote-contracts-sdk";


export interface VotingPower {
    [voter: string]: string
}

export type ProposalVotingData = {
    txData: TxData;
    votingPower: VotingPower;
    votes: Votes;
    proposalResult: ProposalResult;
}

export type RoundResult = 'passed' | 'failed' | 'ongoing';
export type ValidatorsProposalResult = RoundResult;

export type ValidatorsVotingRoundDetails = {
    vsetId: string,
    votersList: string[],
    totalWeight?: string,
    weightRemaining: string,
    cycleStartTime: number,
    cycleEndTime: number,
    totalValidators: number,
    mainValidators: number,
    status: RoundResult
}

export type ValidatorsVotingData = {
    phash: string,
    critical: number,
    paramId: number,
    paramVal: string,
    roundsDetails: ValidatorsVotingRoundDetails[],
    roundsRemaining: number,
    totalRounds: number,
    wins: number,
    minWins: number,
    losses: number,
    maxLosses: number,
    status: ValidatorsProposalResult
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

export type ProposalsWithMissingData = {[key: string]: Set<VotingPowerStrategyType>}

export type FetcherStatus = 'Init' | 'Synced' | 'Error';

export enum ProposalFetchingErrorReason {
    FETCH_NFT_ERROR = 0,
    FETCH_TRANSACTIONS_ERROR = 1
}

export type SingleProposalData = {
    daoAddress: string,
    proposalAddress: string, 
    metadata: ProposalMetadata,
    votingData?: ProposalVotingData,
    validatorsVotingData?: ValidatorsVotingData,
    fetchErrorReason?: ProposalFetchingErrorReason,
    config11?: any;
}

export type ProposalsData = Map<string, SingleProposalData>

export interface NftHolders {
    [proposalAddress: string] : {[nftHolderAddr: string]: string[]}
}

export interface OperatingValidatorsInfo {
    [proposalAddress: string] : any
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
