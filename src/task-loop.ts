import * as Logger from './logger';
import { errorString, sendNotification } from './helpers';

export class TaskLoop {
  private handle: NodeJS.Timeout | undefined;
  private started = false;

  constructor(private task: () => Promise<unknown>, private delay: number) {}

  runTask = async () => {
    try {
      await this.task();
    } catch (err) {
      Logger.error(`Error in runTask: ${errorString(err)}`);
      sendNotification(`Error in runTask: ${errorString(err)}`);
    } finally {      
      if (this.started) {
        this.scheduleNextRun();
      }
    }
  };

  scheduleNextRun = () => {
    // Logger.log(`next task was scheduled to start in ${this.delay/1000} seconds`);
    
    this.handle = setTimeout(this.runTask, this.delay);
  };

  start = () => {
    if (!this.started) {
      this.started = true;
      this.scheduleNextRun();
    }
  };

  stop = () => {
    this.started = false;
    if (this.handle !== undefined) {
      clearTimeout(this.handle);
    }
  };
}
