import { PubSub, type Message } from '@google-cloud/pubsub';
import { loadEnv, type PubSubTopic } from '@auto-recruit/config';
import { reportError, log } from './lib/reporter.js';

const client = new PubSub({ projectId: loadEnv().GCP_PROJECT_ID });

export function subscribeTopic(
  topic: PubSubTopic,
  handler: (data: unknown) => Promise<void>,
  subscriptionSuffix = 'workers-sub',
): void {
  const subscriptionName = `${topic}-${subscriptionSuffix}`;
  const subscription = client.subscription(subscriptionName);

  subscription.on('message', async (message: Message) => {
    const messageId = message.id;
    try {
      const data: unknown = JSON.parse(message.data.toString());
      log('DEBUG', `[pubsub] received message`, { topic, messageId });
      await handler(data);
      message.ack();
      log('DEBUG', `[pubsub] acked message`, { topic, messageId });
    } catch (err) {
      reportError(err, { topic, messageId, handler: handler.name || 'unknown' });
      // nack so Pub/Sub retries with backoff (up to dead-letter threshold)
      message.nack();
    }
  });

  subscription.on('error', (err) => {
    reportError(err, { topic, subscriptionName, source: 'subscription_error' });
  });

  log('INFO', `[pubsub] subscribed`, { topic, subscriptionName });
}
