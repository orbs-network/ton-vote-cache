import { MetadataArgs, ProposalMetadata, DaoRoles } from "ton-vote-sdk";


export interface TxData {
    tx: [], 
    toLt: undefined | string
};

export interface VotingPower {
    [voter: string]: string
}

export interface Votes {
    [voter: string]: {vote: string, timestamp: string}
}

export interface ProposalResults {
    [key: number]: number,
    totalPower: string
}

export interface ProposalInfo {
    startTime: Number,
    endTime: Number,
    snapshot: {
        snapshotTime: Number, 
        mcSnapshotBlock: Number
    }
}

export interface ProposalCatalog {
    [daoAddress: string]: {
        nextId: number, 
        proposals: {proposalAddr: string, metadata: ProposalMetadata}[]
    }
}

export interface DaoCatalog {
    nextDaoId: number,
    daos: {
        address: string,
        daoId: number,
        daoMetadata: MetadataArgs, 
        roles: DaoRoles
    }[]
}
