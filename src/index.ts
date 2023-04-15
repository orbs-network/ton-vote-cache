import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { errorString } from './helpers';
import { TaskLoop } from './task-loop';
import * as Logger from './logger';
import { State } from './state';
import { Fetcher } from './fetcher';

const SOCKET_TIMEOUT_SEC = 60;
const PORT = Number(process.env.PORT) || 3000;


export function serve() {
  const app = express();
  app.use(cors());
  app.set('json spaces', 2);

  const state = new State();
  const fetcher = new Fetcher(state);

  app.get('/daos/:startDaoId', (_request, response) => {
    const { startDaoId } = _request.params;
    response.status(200).json(state.getDaos(Number(startDaoId)));
  });

  app.get('/dao/:daoAddress', (_request, response) => {
    const { daoAddress } = _request.params;
    response.status(200).json(state.getDaoByAddress(daoAddress));
  });

  app.get('/numDaos', (_request, response) => {
    response.status(200).json(state.getNumDaos());
  });

  app.get('/proposal/:proposalAddress', (_request, response) => {
    const { proposalAddress } = _request.params;
    response.status(200).json(state.getProposal(proposalAddress));
  });

  app.get('/registry', (_request, response) => {
    response.status(200).json(state.getRegistry());
  });

  // app.get('/results/:proposalAddress', (_request, response) => {
  //   const { proposalAddress } = _request.params;
  //   response.status(200).json(state.getProposalResults(proposalAddress));
  // });

  // app.get('/votes/:proposalAddress', (_request, response) => {
  //   const { proposalAddress } = _request.params;
  //   response.status(200).json(state.getProposalVotes(proposalAddress));
  // });

  // app.get('/power/:proposalAddress', (_request, response) => {
  //   const { proposalAddress } = _request.params;
  //   response.status(200).json(state.getProposalVotingPower(proposalAddress));
  // });

  // app.get('/fullProposalData/:proposalAddress', (_request, response) => {
  //   const { proposalAddress } = _request.params;
  //   response.status(200).json(state.getFullProposalData(proposalAddress));
  // });

  app.get('/stateUpdateTime', (_request, response) => {
    response.status(200).json(state.getStateUpdateTime());
  });

  app.get('/fetchUpdateTime', (_request, response) => {
    response.status(200).json(fetcher.getFetchUpdateTime());
  });

  app.get('/maxLt', (_request, response) => {
    response.status(200).json(state.getMaxLt());
  });

  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof Error) {
      Logger.error(`Error response to ${req.url}: ${errorString(error)}.`);
      return res.status(500).json({
        status: 'error',
        error: errorString(error),
      });
    }
    return next(error);
  });

  fetcher.init();
  const fetcherSyncTask = new TaskLoop(() => fetcher.run(), 60 * 1000);  
  fetcherSyncTask.start();

  const server = app.listen(PORT, '0.0.0.0', () =>
    Logger.log(`Dao Vote Server is listening on port ${PORT}!`)
  );

  server.setTimeout(SOCKET_TIMEOUT_SEC * 1000);
  server.requestTimeout = SOCKET_TIMEOUT_SEC * 1000;
  server.on('close', () => {
    fetcherSyncTask.stop();
  });
  return server;
}
