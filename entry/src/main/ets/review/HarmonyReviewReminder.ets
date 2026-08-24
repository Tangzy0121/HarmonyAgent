import { common } from '@kit.AbilityKit'
import { preferences } from '@kit.ArkData'
import { reminderAgentManager } from '@kit.BackgroundTasksKit'
import {
  ReminderGateway,
  ReminderIdStore,
  ReminderRegistration,
  ReviewTask,
  buildReminderPayload
} from './ReviewReminderScheduler'

const BUNDLE_NAME: string = 'com.tangzy.harmonyagent'
const ABILITY_NAME: string = 'EntryAbility'
const STORE_NAME: string = 'review-reminder-mapping'

export class HarmonyReminderGateway implements ReminderGateway {
  async publish(task: ReviewTask): Promise<number> {
    const payload = buildReminderPayload(task)
    const parameters: Record<string, Object> = {}
    parameters['bookId'] = payload.parameters.bookId
    parameters['chapterId'] = payload.parameters.chapterId
    parameters['blockId'] = payload.parameters.blockId
    parameters['action'] = payload.parameters.action
    const request: reminderAgentManager.ReminderRequestCalendar = {
      reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_CALENDAR,
      dateTime: {
        year: payload.dateTime.year,
        month: payload.dateTime.month,
        day: payload.dateTime.day,
        hour: payload.dateTime.hour,
        minute: payload.dateTime.minute,
        second: payload.dateTime.second
      },
      title: task.title,
      content: '复习任务已到期，点击回到对应学习块。',
      expiredContent: '复习任务已到期',
      tapDismissed: true,
      wantAgent: { pkgName: BUNDLE_NAME, abilityName: ABILITY_NAME, parameters: parameters }
    }
    return reminderAgentManager.publishReminder(request)
  }

  async cancel(reminderId: number): Promise<void> {
    await reminderAgentManager.cancelReminder(reminderId)
  }
}

export class PreferencesReminderIdStore implements ReminderIdStore {
  private context: common.Context

  constructor(context: common.Context) {
    this.context = context
  }

  private async values(): Promise<preferences.Preferences> {
    return preferences.getPreferences(this.context, STORE_NAME)
  }

  async get(taskId: string): Promise<ReminderRegistration | null> {
    const values: preferences.Preferences = await this.values()
    const reminderValue: preferences.ValueType = await values.get(`${taskId}:id`, -1)
    const fingerprintValue: preferences.ValueType = await values.get(`${taskId}:fingerprint`, '')
    if (typeof reminderValue !== 'number' || reminderValue < 0 || typeof fingerprintValue !== 'string' ||
      fingerprintValue.length === 0) return null
    return new ReminderRegistration(reminderValue, fingerprintValue)
  }

  async put(taskId: string, registration: ReminderRegistration): Promise<void> {
    const values: preferences.Preferences = await this.values()
    await values.put(`${taskId}:id`, registration.reminderId)
    await values.put(`${taskId}:fingerprint`, registration.fingerprint)
    await values.flush()
  }

  async delete(taskId: string): Promise<void> {
    const values: preferences.Preferences = await this.values()
    await values.delete(`${taskId}:id`)
    await values.delete(`${taskId}:fingerprint`)
    await values.flush()
  }
}
