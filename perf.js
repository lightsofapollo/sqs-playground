import { SQS, SNS } from 'aws-sdk-promise';
import os from 'os';
import { createHash } from 'crypto';
import math from 'mathjs';

const host = new Buffer('testing-sqs2-' + os.hostname()).toString('base64');

const MESSAGES = 2000;
const TOPIC = 'sqs-to-sns-testing-jlal';

async function sendMessages(sns, topicArn) {
  let total = MESSAGES;
  console.time('send');
  while (total--) {
    let res = await sns.publish({
      TopicArn: topicArn,
      Message: new Buffer(JSON.stringify({
        now: Date.now()
      })).toString('base64')
    }).promise();
  }
  console.timeEnd('send');
}

async function getFromQueue(sqs, url) {
  console.time('get')
  let pendingMessages = MESSAGES;
  let times = [];
  while(pendingMessages > 0) {
    let fetch = await sqs.receiveMessage({
      QueueUrl: url,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20
    }).promise();

    let messages = fetch.data.Messages;
    if (!messages) continue;
    pendingMessages -= messages.length;

    let pendingDeletes = [];

    for (let message of messages) {
      pendingDeletes.push(sqs.deleteMessage({
        QueueUrl: url,
        ReceiptHandle: message.ReceiptHandle
      }).promise());

      let body = JSON.parse(message.Body);
      body = JSON.parse(new Buffer(body.Message, 'base64').toString());
      let time = Date.now() - body.now;
      times.push(time);
      console.log('Got response %d seconds (%d left)', time/1000, pendingMessages);
    }
  }
  console.timeEnd('get');
  console.log('get median: %d seconds', math.median(times)/1000);

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

async function createTopic(sns) {
  let topic = await sns.createTopic({
    Name: TOPIC,
  }).promise();
  return topic.data.TopicArn;
}

async function main() {
  console.time('create queue');
  let sqs = new SQS({ region: 'us-west-2' });
  let sns = new SNS({ region: 'us-west-2' });

  let [topicArn, queueUrl] =
    await Promise.all([createTopic(sns), getOrCreateQueue(sqs)]);

  let queueDetails = await sqs.getQueueAttributes({
    QueueUrl: queueUrl,
    AttributeNames: ['QueueArn']
  }).promise();
  console.timeEnd('create queue');

  let queueArn = queueDetails.data.Attributes.QueueArn;

  let policy = {
    Version: '2008-10-17',
    Id: queueArn + '/SQSDefaultPolicy',
    Statement: [{
      Sid: "Sid" + Date.now(),
      Effect: "Allow",
      Principal: {
        // This should be okay since you need specific permission to publish to
        // the source arn for this to actually allow you to send stuff...
        AWS: '*'
      },
      Action: 'SQS:SendMessage',
      Resource: queueArn,
      Condition: {
        ArnEquals: {
          'aws:SourceArn': topicArn
        }
      }
    }]
  }

  await sqs.setQueueAttributes({
    QueueUrl: queueUrl,
    Attributes: {
      Policy: JSON.stringify(policy)
    }
  }).promise();

  console.time('subscribe');
  let params = {
    TopicArn: topicArn,
    Protocol: 'sqs',
    Endpoint: queueArn
  }
  console.log(params);
  let res = await sns.subscribe(params).promise();
  console.timeEnd('subscribe');
  console.log(res.data)

  await Promise.all([
    sendMessages(sns, topicArn),
    getFromQueue(sqs, queueUrl)
  ]);
}


main().catch((e) => {
  setTimeout(() => { throw e; });
});
