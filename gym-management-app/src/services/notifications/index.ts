/**
 * Notification service barrel — provider-agnostic delivery contracts plus the in-app
 * notification surface consumers. Exposes the provider/dispatch helpers without touching the
 * existing in-app bell / hook behaviour.
 */

export {
  createNotificationProvider,
  dispatchNotification,
  isNotificationChannelConfigured,
  resolveNotificationProviders,
  type NotificationChannel,
  type NotificationDeliveryResult,
  type NotificationDispatchInput,
  type NotificationDispatchOptions,
  type NotificationDispatchResult,
  type NotificationMessage,
  type NotificationProvider,
  type NotificationProviderConfig,
} from './provider';
