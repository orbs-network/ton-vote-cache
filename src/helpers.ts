import axios from 'axios';
import dotenv from 'dotenv';
import { ProposalMetadata, VotingPowerStrategy } from "ton-vote-contracts-sdk";
import { log } from './logger';
import { ProposalState } from './types';
import { Address, TupleItem, Cell } from 'ton';
import fs from 'fs/promises';
import path from 'path';
import { backOff } from 'exponential-backoff';
// import * as TonVoteSdk from "ton-vote-contracts-sdk";

const CHECKPOINT_DIR = process.cwd(); // or wherever you prefer
const BATCH_SIZE = 25;


dotenv.config();


export function intToTupleItem(value: number): TupleItem[] {
  return [{'type': 'int', value: BigInt(value)}]
}

export function cellToAddress(cell :Cell): Address {
  return cell.beginParse().loadAddress();
}  

function extractValueFromStrategy(votingPowerStrategies: VotingPowerStrategy[], nameFilter: string): string | undefined {

  const strategy = votingPowerStrategies.find((strategy) => strategy.arguments.some((arg) => arg.name === nameFilter));

  if (!strategy) return;

  return strategy.arguments.find((arg) => arg.name === nameFilter)?.value;
} 
// create an array of numbers, from 0 to range
export function range(length: number) {
  return [...Array(length).keys()];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorString(e: any) {
  return (e && e.stack) || '' + e;
}

export function timeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject('Timed out in ' + ms + 'ms.'), ms)),
  ]);
}

export function toNumber(val: number | string) {
  if (typeof val == 'string') {
    return parseInt(val);
  } else return val;
}

function byte(value: number, byteIdx: number) {
  const shift = byteIdx * 8;
  return ((value & (0xff << shift)) >> shift) & 0xff;
}

export function getIpFromHex(ipStr: string): string {
  const ipBytes = Number(ipStr);
  return byte(ipBytes, 3) + '.' + byte(ipBytes, 2) + '.' + byte(ipBytes, 1) + '.' + byte(ipBytes, 0);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// returns UTC clock time in seconds (similar to unix timestamp / Ethereum block time / RefTime)
export function getCurrentClockTime() {
  return Math.round(new Date().getTime() / 1000);
}

export const day = 24 * 60 * 60;

export const year = day * 365;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonResponse = any;

export type DailyStatsData = { day: string; count: number }[];

export class DailyStats {
  private data: DailyStatsData = [];
  constructor(private daysToRemember = 7) {}
  add(num: number) {
    const day = this.today();
    if (this.data.length > 0 && this.data[this.data.length - 1].day == day) {
      this.data[this.data.length - 1].count += num;
    } else {
      this.data.push({ day, count: num });
    }
    if (this.data.length > this.daysToRemember) {
      this.data.splice(0, this.data.length - this.daysToRemember);
    }
  }
  today(): string {
    return new Date().toISOString().substr(0, 10);
  }
  getStats() {
    return this.data;
  }
}

export function normalizeAddress(address: string): string {
  if (!address) return address;
  if (address.startsWith('0x')) return address.substr(2).toLowerCase();
  return address.toLowerCase();
}

export async function sendNotification(message: string) {
  if (!process.env.TELEGRAM_NOTIF_GROUP_TOKEN || !process.env.TELEGRAM_NOTIF_GROUP_CHAT_ID) {
    return;  
  }

  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_NOTIF_GROUP_TOKEN}/sendMessage`;
  const body = {
      chat_id: process.env.TELEGRAM_NOTIF_GROUP_CHAT_ID,
      text: `[${process.env.ENV_NAME}]: ${message}`,
      parse_mode: 'HTML'
  };

  try {
      await axios.post(url, body);

  } catch (error) {
      console.error('Error sending notification:', error);
  }
}

export async function getOrderedDaosByPriority(): Promise<string[]> {
  
  const file_url = 'https://raw.githubusercontent.com/orbs-network/ton-vote-cache/main/src/ordered-daos.text';

  try {
    const response = await axios.get(file_url, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    return response.data
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line !== ''); 

  } catch (error) {
    console.error('Error reading file:', error);
    return [];
  }
  
}

export async function isVerifiedDao(daoAddr: string, websiteUrl: string) {
    const response = await axios.get(websiteUrl + "ton-vote.txt");
    return response.data == daoAddr;
}

export function replacer(_key: string, value: any) {
  if (typeof value === 'bigint') {
    return { type: 'BigInt', value: value.toString() };
  } else {
    return value;
  }
}

export function reviver(_key: string, value: any) {
  if (value && value.type === 'BigInt') {
    return BigInt(value.value);
  } else {
    return value;
  }
}

export function getProposalState(proposalAddress: string, metadata: ProposalMetadata) {

  const now = Date.now() / 1000;

  if (!metadata) {
      log(`unexpected error: could not find metadata for proposal ${proposalAddress}`);
      return ProposalState.undefined;
  }

  if (now < metadata.proposalStartTime) {                
    return ProposalState.pending;
  }

  if (metadata.proposalStartTime <= now && now < metadata.proposalEndTime) {                
    return ProposalState.active;
  }

  if (metadata.proposalEndTime <= now) {
    return ProposalState.ended;
  }  

  return ProposalState.undefined;
}

export function isValidAddress(address: string): boolean {
  try {
      Address.parse(address);
      return true;
  } catch (error) {
      return false;
  }
}

interface Checkpoint {
  nextBatch: number;
  holders: Record<string, string[]>;
}

async function saveCheckpoint(
  nftAddress: string,
  nextBatch: number,
  holders: Record<string, string[]>
) {
  const file = path.join(CHECKPOINT_DIR, `checkpoint_${nftAddress}.json`);
  const data: Checkpoint = { nextBatch, holders };
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

async function loadCheckpoint(
  nftAddress: string
): Promise<Checkpoint | null> {
  const file = path.join(CHECKPOINT_DIR, `checkpoint_${nftAddress}.json`);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

export async function getAllNftHolders(
  clientV4: any,
  proposalMetadata: any
): Promise<Record<string, string[]>> {

  const holders: Record<string, string[]> = {};
  const nftAddress = extractValueFromStrategy(
    proposalMetadata.votingPowerStrategies,
    'nft-address'
  );
  
  if (!nftAddress) {
    console.log(`No nftAddress found for proposalMetadata: ${JSON.stringify(proposalMetadata)}`);
    return holders;
  }

  // 1. Fetch collection size
  const info = await clientV4.runMethod(
    proposalMetadata.mcSnapshotBlock,
    Address.parse(nftAddress),
    'get_collection_data'
  );
  if (info.exitCode || info.result[0].type !== 'int') {
    console.log(
      `Collection not found or bad format: ${nftAddress}`,
      proposalMetadata
    );
    return holders;
  }
  const totalItems = Number(info.result[0].value);
  const totalBatches = Math.ceil(totalItems / BATCH_SIZE);
  if (totalBatches > 500) {
    console.log(`Too many items (${totalItems}), aborting.`);
    return holders;
  }

  // 2. See if we have a checkpoint
  let startBatch = 0;
  const cp = await loadCheckpoint(nftAddress);
  if (cp) {
    startBatch = cp.nextBatch;
    Object.assign(holders, cp.holders);
    console.log(`Resuming from batch #${startBatch}`);
  } else {
    console.log(`Starting fresh: ${totalItems} items in ${totalBatches} batches`);
  }

  // 3. Iterate batches
  for (let batch = startBatch; batch < totalBatches; batch++) {
    const start = batch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, totalItems);
    console.log(`Batch ${batch + 1}/${totalBatches}: items ${start}–${end - 1}`);

    try {
      // fetch all items in this batch in parallel
      const calls = [];
      for (let idx = start; idx < end; idx++) {
        calls.push(
          backOff(async () => {
            // 1) get NFT item address by index
            const r1 = await clientV4.runMethod(
              proposalMetadata.mcSnapshotBlock,
              Address.parse(nftAddress),
              'get_nft_address_by_index',
              intToTupleItem(idx)
            );
            if (r1.result[0].type !== 'slice') {
              throw new Error(`Bad address slice at idx ${idx}`);
            }
            const itemAddr = cellToAddress(r1.result[0].cell);

            // 2) get NFT data for owner
            const r2 = await clientV4.runMethod(
              proposalMetadata.mcSnapshotBlock,
              itemAddr,
              'get_nft_data'
            );
            if (!r2.result[3] || r2.result[3].type !== 'slice') {
              throw new Error(`Bad data slice for NFT ${itemAddr}`);
            }
            const owner = cellToAddress(r2.result[3].cell).toString();
            if (!holders[owner]) holders[owner] = [];
            holders[owner].push(itemAddr.toString());
          })
        );
      }

      // wait for all in this batch
      await Promise.all(calls);

      // checkpoint after successful batch
      await saveCheckpoint(nftAddress, batch + 1, holders);
    } catch (err) {
      console.error(`Error in batch ${batch}:`, err);
      // on failure, checkpoint is already at this batch, so next run will retry it
      throw err;
    }
  }

  // 4. Done—cleanup checkpoint
  const cpFile = path.join(CHECKPOINT_DIR, `checkpoint_${nftAddress}.json`);
  await fs.unlink(cpFile).catch(() => {});

  return holders;
}

export async function processInBatches<T>(
  array: T[],
  batchSize: number,
  callback: (item: T) => Promise<void>
): Promise<void> {
  const batchCount = Math.ceil(array.length / batchSize);
  const results: PromiseSettledResult<void>[] = [];

  for (let i = 0; i < batchCount; i++) {
    const batchPromises = array
      .slice(i * batchSize, (i + 1) * batchSize)
      .map(callback);

    const settledBatch = await Promise.allSettled(batchPromises);
    results.push(...settledBatch);
  //   await TonVoteSdk.sleep(2000); 
  }

  const failedPromises = results.filter(result => result.status === 'rejected');

  if (failedPromises.length > 0) {
    console.log('Failed Promises:');
    failedPromises.forEach((result, index) => {
      if ('reason' in result && result.reason !== undefined) {
        console.log(`Promise ${index + 1}:`, result.reason);
      } else {
        console.log(`Promise ${index + 1}: Rejected with no reason provided`);
      }
    });
  }

}
   

// async function testGetAllNftHolders() {
//   try {
//     const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' });
//     const client4 = new TonClient4({ endpoint: "https://mainnet-v4.tonhubapi.com", timeout: 15000 });
    
//     const proposalMetadata = await TonVoteSdk.getProposalMetadata(
//       client, 
//       client4, 
//       "EQCcEiCESPj3giMrUMLBn1eLg7XmcgaJ89sS1MRidP2PaC7G"
//     );
    
//     console.log(`proposalMetadata: ${JSON.stringify(proposalMetadata)}`);

//     const result = await getAllNftHolders(client4, proposalMetadata);
//     console.log('Result:', result);
//   } catch (error) {
//     console.error('Error:', error);
//   }
// }

// testGetAllNftHolders();
