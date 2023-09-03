import { TonClient4 } from "ton";
import { getConfig11, proposalResults } from "ton-vote-contracts-sdk";
import { RoundResult, SingleProposalData, ValidatorsVotingRoundDetails } from "../types";
import { error, log } from "../logger";


export async function getConfigProposalResults(client4: TonClient4, proposalData: SingleProposalData) {
    let validatorsVotingData = proposalData.validatorsVotingData;
    let config11 = proposalData.config11;

    const proposalMetadata = proposalData.metadata;

    if (!(proposalMetadata.votingPowerStrategies[0].arguments[0].name == 'validators-proposal-hash')) return;
    const phash = proposalMetadata.votingPowerStrategies[0].arguments[0].value;

    if (!validatorsVotingData) {
        log(`validatorsVotingData is undefined for phash ${phash} proposal address ${proposalData.proposalAddress}`);
        return;
    }

    if ('status' in validatorsVotingData && validatorsVotingData.status != 'ongoing') {
        log(`[Warning] proposal with phash ${phash} already ended with status ${validatorsVotingData.status}`);
        return;
    }

    let res = await proposalResults(client4, phash);

    // general proposal info will not change for the entire proposal (on several cycles)
    // we ignore changes in config11 during an active proposal
    if (!(phash in validatorsVotingData)) {
        validatorsVotingData.phash = phash;
        validatorsVotingData.critical = res.critical;
        validatorsVotingData.paramId = res.param_id;
        validatorsVotingData.paramVal = res.param_val;
        validatorsVotingData.totalRounds = config11.max_tot_rounds;
        validatorsVotingData.minWins = config11.min_wins;
        validatorsVotingData.maxLosses = config11.max_losses;
        validatorsVotingData.status = "ongoing";
    }

    if (!Object.keys(config11).length) {
        proposalData.config11 = await getConfig11(client4, proposalMetadata.mcSnapshotBlock, res.critical);
    }

    let currRoundNum = config11.max_tot_rounds - res.rounds_remaining;

    if (currRoundNum < 0) {
        error(`Error: unexpected value to currRoundNum = ${currRoundNum}`);
        return;
    }

    let validatorsVotingRoundDetails: ValidatorsVotingRoundDetails = {
        vsetId: res.vset_id,
        votersList: res.voters_list,
        weightRemaining: res.weight_remaining,
        cycleStartTime: res.config34.utime_since,
        cycleEndTime: res.config34.utime_until,
        totalValidators: res.config34.total_validators,
        mainValidators: res.config34.main_validators,
        status: "ongoing" as RoundResult
    }

    // a new round dectected we want to update the previous round status and add the new round
    if (currRoundNum >= validatorsVotingData.roundsDetails.length) {
        
        // update previous round
        // if this is not the first round we need to update the pervious round status
        // TODO: optimize status calc by getting the weightRemaining of the last block from previous cycle
        if (validatorsVotingData.roundsDetails.length > 0) {
            validatorsVotingData.roundsDetails[validatorsVotingData.roundsDetails.length-1].status = BigInt(validatorsVotingData.roundsDetails[validatorsVotingData.roundsDetails.length-1].weightRemaining) < 0 ? "passed": "failed";
        }
        
        validatorsVotingData.roundsDetails[validatorsVotingData.roundsDetails.length-1].totalWeight = "-1"; // TODO: FIXME get from api

        validatorsVotingData.roundsDetails.push(validatorsVotingRoundDetails);

        // will be updated only on new round
        validatorsVotingData.roundsRemaining = res.rounds_remaining;
    
    } else {
        validatorsVotingData.roundsDetails[currRoundNum] = validatorsVotingRoundDetails;
    }

    // those values can change any time
    validatorsVotingData.wins = res.wins;
    validatorsVotingData.losses = res.losses;

    // proposal status
    if (res.wins >= config11.min_wins) {
        validatorsVotingData.status = "passed";
    } else if (res.losses >= config11.max_losses) {
        validatorsVotingData.status = "failed";
    }

    return validatorsVotingData;
}
