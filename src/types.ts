import { Transaction } from "ton";
import { MetadataArgs, ProposalMetadata, DaoRoles, Votes, ProposalResult } from "ton-vote-sdk";


export interface TxData {
    allTxns: Transaction [], 
    maxLt: undefined | string
};

export interface VotingPower {
    [voter: string]: string
}

export interface ProposalInfo {
    startTime: Number,
    endTime: Number,
    snapshot: {
        snapshotTime: Number, 
        mcSnapshotBlock: Number
    }
}

export interface ProposalBundle {
    [proposalAddress: string] : {
        txData: TxData;
        votingPower: VotingPower;
        votes: Votes;
        proposalResult: ProposalResult;
    }
}

export type ProposalsByState = {
    pending: Set<{
        proposalAddr: string, 
        metadata: ProposalMetadata
    }>;
    
    active: Set<{
        proposalAddr: string, 
        metadata: ProposalMetadata
    }>;
    
    ended: Set<{
        proposalAddr: string, 
        metadata: ProposalMetadata
    }>;
}

export interface ProposalCatalog {
    [daoAddress: string]: {
        nextId: number, 
        proposals: Map<string, {
            proposalAddr: string, 
            metadata: ProposalMetadata
        }>
    }
}

export interface DaoCatalog {
    nextDaoId: number,
    daos: Map<string, {
        daoAddress: string,
        daoId: number,
        daoMetadata: MetadataArgs,
        daoRoles: DaoRoles
    }>
}
