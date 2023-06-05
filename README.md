# Caching server for ton.vote providing convenient API over on-chain data
- [TON blockchain smart contracts for ton.vote](https://github.com/orbs-network/ton-vote-contracts)
- [TypeScript SDK for interacting with ton.vote contracts](https://github.com/orbs-network/ton-vote-contracts-sdk)
- [Open source React frontend for ton.vote website](https://github.com/orbs-network/ton-vote)
- [Caching server for ton.vote providing convenient API over on-chain data](https://github.com/orbs-network/ton-vote-cache)

---

## Description 

[TON.Vote](https://ton.vote) is a completely decentralized, on-chain DAO governance platform designed exclusively for the TON ecosystem. The system architecture is heavily inspired from [snapshot.org](https://snapshot.org), the de-facto standard in the EVM ecosystem for DAO governance which is used by Uniswap, Sushi, Aave, Arbitrum, etc.

The ton-vote-cache acts as a cache server, fetching data from TON.vote [contracts](https://github.com/orbs-network/ton-vote-contracts) and serving it to the [UI](https://github.com/orbs-network/ton-vote) for a better user experience. 
Although it is possible to use the UI without the cache server, this would result in a slower loading speed, potentially leading to a less optimal user experience.

## Cache Server Workflow
The cache server is designed to periodically fetch and update data from the TON.Vote contracts using the TON.Vote [contracts-sdk](https://github.com/orbs-network/ton-vote-contracts-sdk). The server fetches the data in several stages.

Initially, the server updates the list of registered DAOs and checks if there are any new DAOs added since the last update. For each new DAO, the server updates the list of new proposals associated with that DAO.

Next, the server retrieves all relevant data from the contracts for each new proposal, such as its ID, owner, title, description, metadata, voting system, and voting power strategy.

Finally, the server updates the voting data and results for each proposal. This includes information such as the list of voters and their voting power, the votes cast, and the final results of the vote.

By caching this data and periodically updating it, the cache server is able to provide faster access to information for the UI, improving the overall user experience.

## APIs 

The cache server has 2 endpoints:
- dev - https://dev-ton-vote-cache-server.herokuapp.com
- production - https://ton-vote-cache-server.herokuapp.com

### /daos
Returns a list of all registered daos. Every dao in the list is an object which includes:
 - daoAddress - address of the dao contract
 - daoId: a unique id of the dao
 - daoMetadata: such as title, logo and other metadta of the dao
 - daoRoles: every space has 2 roles 
    1. DAO dao owner: can change dao metadata, update owners and create new proposals    
    2. Proposal publisher: can create new proposals
 - nextProposalId: the id of the next proposal to be created in the dao. This is a running index so if for example the dao has 3 proposals the value of this param will be 3
 - daoProposals: a list of all address of the proposals of this dao. The list size should be equal to nextProposalId 

exmaple: https://ton-vote-cache-server.herokuapp.com/daos

```
[{
  "daoAddress": "EQBXOjSadD0rTzWTESeHroy33SlcbqBkYSCmA02dEgMIcv0G",
  "daoId": 61,
  "daoMetadata": {
    "about": "{\"en\":\"test1\"}",
    "avatar": "https://www.orbs.com/assets/img/common/logo.png",
    "github": "",
    "hide": false,
    "name": "{\"en\":\"test\"}",
    "terms": "",
    "telegram": "",
    "website": "",
    "jetton": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo",
    "nft": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo"
  },
  "daoRoles": {
    "owner": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo",
    "proposalOwner": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo"
  },
  "nextProposalId": 0,
  "daoProposals": []
}]
```

### /dao/:daoAddress
Returns a single dao at address daoAddress as an object. The returned object is the same format as returned by /daos endpoint.

example: https://ton-vote-cache-server.herokuapp.com/dao/EQBXOjSadD0rTzWTESeHroy33SlcbqBkYSCmA02dEgMIcv0G

```
{
  "daoAddress": "EQBXOjSadD0rTzWTESeHroy33SlcbqBkYSCmA02dEgMIcv0G",
  "daoId": 61,
  "daoMetadata": {
    "about": "{\"en\":\"test1\"}",
    "avatar": "https://www.orbs.com/assets/img/common/logo.png",
    "github": "",
    "hide": false,
    "name": "{\"en\":\"test\"}",
    "terms": "",
    "telegram": "",
    "website": "",
    "jetton": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo",
    "nft": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo"
  },
  "daoRoles": {
    "owner": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo",
    "proposalOwner": "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo"
  },
  "nextProposalId": 0,
  "daoProposals": []
}
```

### /numDaos
Returns the number of registered daos.

example: https://ton-vote-cache-server.herokuapp.com/numDaos

```
62
```

### /proposal/:proposalAddress
Returns an object which includes information about the proposal contract at address proposalAddress.
- daoAdress: the dao address of the proposal
- metadata: metadata of the proposal, includes proposal id, proposal owner etc.
- information about the vote:
    - votingPower: an object with all voters addresses as keys and voting power of each voter as value
    - votes: an object with voters addresses as keys and object with vote details as value. The vote detail includes vote timestamp, vote value and hash of the vote
    - proposalResults: an object with all votes choices (e.g.: yes, no, abstain) as keys and percentage of each choice as value. The results is calculated after counting all voters voting power and summing the results. The totalWeight is also returned in this object which is the sum of voting power of all voters
- The information regarding the vote can be also calculated directly from [contracts-sdk](https://github.com/orbs-network/ton-vote-contracts-sdk)


example: https://ton-vote-cache-server.herokuapp.com/proposal/EQBeHRBlsDK-2ZGlmRb7D_WwOY0gObuXrkRb-RC_TWI2Awll

```
{
  "daoAddress": "EQC0Bl4oJvhhR1RI54S5V9Lfu3b6SWaXwnLo73aJzzVZk-u1",
  "metadata": {
    "id": 0,
    "owner": "EQCuBHSMNsSmD7x6gruKBmTDRA9Y_Zvx0ipxoVcUOQs6RVD0",
    "mcSnapshotBlock": 29160010,
    "proposalStartTime": 1682858520,
    "proposalEndTime": 1683061200,
    "proposalSnapshotTime": 1682802000,
    "votingSystem": {
      "choices": [],
      "votingSystemType": -1
    },
    "votingPowerStrategy": 0,
    "title": "{\"en\":\"[TEMP CHECK] Aave V3 GHO Genesis Parameters\"}",
    "description": "{\"en\":\"Summary\\nThis Snapshot aims to solidify the community’s preference around GHO’s starting parameters for the V3 Ethereum facilitator.\\n\\n#Voting Options\\nGiven there is still some discussion around trade-offs between scalability and managing risk in terms of how aggressive the initial parameters should be, we believe it is best to take two options to Snapshot, option A as proposed by the ACI in consort with Chaos Labs, and option B as proposed initially by Aave Companies. The DAO’s preference can then be expressed clearly.\\n\\nFor option A, the following parameters are proposed in line with the ACI and Chaos Labs’ recommendations\"}",
    "jetton": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    "nft": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"
  },
  "votingPower": {
    "EQCBrRdawVLx66y2O7qYPqrFmd9jUCDbR8bXjC4m1SymwhnV": "134623266963",
    "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo": "48628402559"
  },
  "votes": {
    "EQCBrRdawVLx66y2O7qYPqrFmd9jUCDbR8bXjC4m1SymwhnV": {
      "timestamp": 1682858557,
      "vote": "Yes",
      "hash": "58842089638220384150921253370677077512108378741749551882068235187052030708536"
    },
    "EQDehfd8rzzlqsQlVNPf9_svoBcWJ3eRbz-eqgswjNEKRIwo": {
      "timestamp": 1683023632,
      "vote": "No",
      "hash": "74202196333700654773643909019249916464908037830610024502478413036130049971725"
    }
  },
  "proposalResult": {
    "yes": 73.46,
    "no": 26.54,
    "abstain": 0,
    "totalWeight": "183251669522"
  }
}
```

## /proposalNftHolders/:proposalAddress
Returns a list of all nft holders of proposal at address proposalAddress.
This is relevant only for nft proposals and an empty list is returned if the vote is not nft collection.

example: https://ton-vote-cache-server.herokuapp.com/proposalNftHolders/EQCKxuCCdzhYXbovkecCODPQzuYi8iCHm5b2EsU6Ul-w9h2I

```
TBD
```

## maxLt/:proposalAddress
Returns the max lt of the proposal at proposalAddress.
maxLt represents the maximum logical time of the transactions of the proposal.
The server is perioidcally fetching proposals data this includes the voting transactions sent to the proposal contract. Every transaction has an lt and the max lt represent the most recent transaction. This api might assist in understanding the sync state of the server. For example a very old max lt might indicate on a server sync issue, in this case the client can fetch data directly from the contract using the contracts sdk.


exmaple: https://ton-vote-cache-server.herokuapp.com/maxLt/EQCKxuCCdzhYXbovkecCODPQzuYi8iCHm5b2EsU6Ul-w9h2I

```
"37448608000007"
```


## /proposalAddrWithMissingNftCollection
When a new nft proposal is created the server will fetch all nft holders of this collection. This API returns a set of nft proposals which the server did not fetch their nft holders yet. Usually this set should be empty. 

## /registry
Returns the registry contract address. The registry contract is used to create new daos be sending a create message from the owner. Read [contract](https://github.com/orbs-network/ton-vote-contracts) repo for more information.


# Contribution Guidelines
We appreciate your help in improving the TON.Vote platform. If you've encountered a bug or have an idea for a new feature, please open a new issue or pull request on our [GitHub repository](https://github.com/orbs-network/ton-vote-cache/issues).

When opening an issue, please provide as much detail as possible about the bug or feature request, including steps to reproduce the issue and any relevant logs or screenshots.

# Related Repositories
- Ton.Vote UI: https://github.com/orbs-network/ton-vote
- Ton.Vote Contracts: https://github.com/orbs-network/ton-vote-contracts
- Ton.Vote Contracts SDK: https://github.com/orbs-network/ton-vote-contracts-sdk


