import * as Logger from './logger';
import { errorString, sendNotification } from './helpers';

export class TaskLoop {
  private handle: NodeJS.Timeout | undefined;
  private started = false;

  constructor(private task: () => Promise<unknown>, private pause: number) {}

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
    const now = new Date();
    const secondsPassed = now.getSeconds() * 1000 + now.getMilliseconds();
    const delay = (this.pause - secondsPassed) % this.pause;    
    // Logger.log(`next task was scheduled to start in ${delay/1000} seconds`);
    
    this.handle = setTimeout(this.runTask, delay);
  };

  start = () => {
    sendNotification('Task-loop start was called');
    if (!this.started) {
      this.started = true;
      this.scheduleNextRun();
    }
  };

  stop = () => {
    this.started = false;
    sendNotification('Task-loop stop was called');
    if (this.handle !== undefined) {
      clearTimeout(this.handle);
    }
  };
}
