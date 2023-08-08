
import {RoundResult} from "../types";


const validatorsMock = {
    "phash": "27848878697373229758863607066613445539857911080624014948686208648269380730918",
    "critical": 0,
    "paramId": 5,
    "paramVal": "0",
    "roundsRemaining": 4,
    "totalRounds": 6,
    "wins": 1,
    "minWins": 2,
    "losses": 1,
    "maxLosses": 3,
    "roundsDetails": [
        {
            "vsetId": "11193408191068227377353827824230636431057727618416128735691923439556386359472",
            "votersList": ["1", "5", "9", "12", "22"],
            "totalWeight": "1152921504606846800",
            "weightRemaining": "88562184540800798",
            "cycleStartTime": 1686982408,
            "cycleEndTime": 1687047944,
            "totalValidators": 320,
            "mainValidators": 100,
            "result": "failed" as RoundResult
        }, 
        {
            "vsetId": "11193408191068227377353827824230636431057727618416128735691923439556386359472",
            "votersList": ["1", "5", "9", "12", "22"],
            "totalWeight": "1152921504606846800",
            "weightRemaining": "-6949798466977332",
            "cycleStartTime": 1686982408,
            "cycleEndTime": 1687047944,
            "totalValidators": 320,
            "mainValidators": 100,
            "result": "passed"  as RoundResult

        }, 
        {
            "vsetId": "11193408191068227377353827824230636431057727618416128735691923439556386359472",
            "votersList": ["1", "5", "9", "12", "22"],
            "totalWeight": "1152921504606846800",
            "weightRemaining": "-6949798466977332",
            "cycleStartTime": 1686982408,
            "cycleEndTime": 1687047944,
            "totalValidators": 320,
            "mainValidators": 100,
            "result": "ongoing"  as RoundResult
        }
    ]

}

export function getValidatorsMock(phash: string) {
    if (phash == validatorsMock.phash) return validatorsMock;
    return {};
}