import { SQS } from 'aws-sdk-promise';
import os from 'os';
import { createHash } from 'crypto';

const host = new Buffer('testing-sqs-' + os.hostname()).toString('base64');

const MESSAGES = 100;

async function sendMessages(sqs, url) {
  let total = MESSAGES;
  console.time('send');
  while (total--) {
    await sqs.sendMessage({
      QueueUrl: url,
      MessageBody: new Buffer(JSON.stringify({
        url,
        now: Date.now()
      })).toString('base64')
    }).promise();

  }
  console.timeEnd('send');
}

async function getFromQueue(sqs, url) {
  console.time('get')
  let pendingMessages = MESSAGES;

  while(pendingMessages > 0) {
    let fetch = await sqs.receiveMessage({
      QueueUrl: url,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20
    }).promise();


    let messages = fetch.data.Messages;
    pendingMessages -= messages.length;

    let pendingDeletes = [];

    for (let message of messages) {
      pendingDeletes.push(sqs.deleteMessage({
        QueueUrl: url,
        ReceiptHandle: message.ReceiptHandle
      }).promise());

      let body = JSON.parse(new Buffer(message.Body, 'base64').toString());
      console.log('took %s seconds (%d left)', (Date.now() - body.now) / 1000, pendingMessages);
    }
  }
  console.timeEnd('get');
}

async function getOrCreateQueue(sqs) {
  var md5 = createHash('md5').update(host).digest('hex');

  try {
    let getQueueUrl = await sqs.getQueueUrl({
      QueueName: md5
    }).promise();
    return getQueueUrl.data.QueueUrl;
  } catch (e) {
    console.log('Failed to directly fetch queue url', e);
  }

  let queue = await sqs.createQueue({
    QueueName: md5,
    Attributes: {
      ReceiveMessageWaitTimeSeconds: '20'
    }
  }).promise();
  return queue.data.QueueUrl;

}

async function main() {
  console.time('create queue');
  let sqs = new SQS({ region: 'us-west-2' });
  let queueUrl = await getOrCreateQueue(sqs);

  console.timeEnd('create queue');

  await Promise.all([
    sendMessages(sqs, queueUrl),
    getFromQueue(sqs, queueUrl)
  ]);
}


main().catch((e) => {
  setTimeout(() => { throw e; });
});
