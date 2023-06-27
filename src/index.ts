import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { errorString, sendNotification } from './helpers';
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

  app.use((_req, res, next) => {
    res.set('FetcherStatus', fetcher.getStatus());
    next();
  });
  
  app.get('/daos', (_request, response) => {
    response.status(200).json(state.getDaos());
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

  app.get('/proposalNftHolders/:proposalAddress', (_request, response) => {
    const { proposalAddress } = _request.params;
    response.status(200).json(state.getProposalNftHolders(proposalAddress));
  });

  app.get('/maxLt/:proposalAddress', (_request, response) => {
    const { proposalAddress } = _request.params;
    response.status(200).json(state.getMaxLt(proposalAddress));
  });

  app.get('/proposalAddrWithMissingNftCollection', (_request, response) => {
    response.status(200).json(fetcher.getProposalAddrWithMissingNftCollection());
  });

  app.get('/registry', (_request, response) => {
    response.status(200).json(state.getRegistry());
  });

  app.get('/updateTime', (_request, response) => {
    response.status(200).json(state.getUpdateTime());
  });

  app.get('/fetchUpdateTime/:proposalAddress', (_request, response) => {
    const { proposalAddress } = _request.params;
    response.status(200).json(fetcher.getFetchUpdateTime(proposalAddress));
  });

  app.get('/proposalsByState', (_request, response) => {
    response.status(200).json(fetcher.getProposalsByState());
  });

  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof Error) {
      Logger.error(`Error response to ${req.url}: ${errorString(error)}`);
      sendNotification(`Error response to ${req.url}: ${errorString(error)}`);      
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
