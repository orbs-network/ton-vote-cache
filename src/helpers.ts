import axios from 'axios';
import dotenv from 'dotenv';
import { ProposalMetadata } from "ton-vote-contracts-sdk";
import { log } from './logger';
import { ProposalState } from './types';
import { Address } from 'ton';

dotenv.config();


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
