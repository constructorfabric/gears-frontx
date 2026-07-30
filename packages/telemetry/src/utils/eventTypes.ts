export type TelemetryRecordId = string;

export type TelemetryRecord = TelemetryEventRecord & {
  id: TelemetryRecordId;
  time_triggered: number;
  time_sent?: number;
};

export type TelemetryUserId = string | number;

export type TelemetryEventRecord = {
  name: string;
  data?: TelemetryData;

  context_user_id?: TelemetryUserId;
  context_user_distinct_id?: string;
  context_user_email?: string;
  context_user_username?: string;
  context_user_first_name?: string;
  context_user_last_name?: string;
  context_user_data?: Record<string, any>;

  caused_by_id?: string;
  context_tenant_id?: string;
  context_tenant_name?: string;
  context_source_app_name?: string;
  context_source_app_version?: string;
  context_service_name?: string;
  context_service_version?: string;
  context_call_chain?: string[];
  context_app_name?: string;
  context_app_version?: string;
  context_device_id?: string;
  context_device_screen_width?: number;
  context_device_screen_height?: number;
  context_device_touch_support?: boolean;
  context_os_name?: string;
  context_os_version?: string;
  context_os_platform?: string;
  context_client_name?: string;
  context_client_version?: string;
  context_client_viewport_width?: number;
  context_client_viewport_height?: number;
  context_session_duration?: number;
  context_dom_element_id?: string;
  context_dom_element_value?: string;
  context_session_id?: string;
  context_session_started_time?: number;
  context_language?: string;
  context_timezone_name?: string;
  context_timezone_utc_offset?: number;
};

export type TelemetryApiRecord = {
  key: TelemetryRecord['id'];
  value: Partial<TelemetryRecord>;
};

export type TelemetryApiPayload = {
  records: TelemetryApiRecord[];
};

export type TelemetryApiPayloadV2 = {
  meta: Partial<TelemetryRecord>;
  records: Partial<TelemetryRecord>[];
};

export type TelemetryData = Record<string, unknown>;

export type TelemetryLogEventParams =
  | [name: TelemetryEventRecord['name'], data?: TelemetryEventRecord['data']]
  | [options: TelemetryEventRecord];
