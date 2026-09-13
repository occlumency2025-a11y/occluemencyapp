// Types for the pilot schema. Keep in step with supabase/migrations/*.sql.
// Regenerate later with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type ThemePref = 'system' | 'light' | 'dark';
export type ConsentKind = 'terms' | 'privacy' | 'marketing';

export type ProviderCategory =
  | 'counsellor'
  | 'therapist'
  | 'psychiatrist'
  | 'yoga'
  | 'meditation'
  | 'coach'
  | 'other';

export type ProviderStatus = 'pilot' | 'paused' | 'dropped';
export type RequestStatus = 'new' | 'matched' | 'completed' | 'cancelled' | 'no_show';
export type Mood = 'great' | 'good' | 'okay' | 'low' | 'stressed';

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  timezone: string;
  locale: string;
  onboarding_completed_at: string | null;
  is_staff: boolean;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  user_id: string;
  theme: ThemePref;
  notifications_enabled: boolean;
  reminder_time: string | null;
  daily_goal_minutes: number;
  analytics_opt_in: boolean;
  created_at: string;
  updated_at: string;
};

export type ConsentRecord = {
  id: string;
  user_id: string;
  kind: ConsentKind;
  version: string;
  granted: boolean;
  created_at: string;
};

/** Safe columns only — the view never exposes phone, email or internal notes. */
export type ProviderPublic = {
  id: string;
  name: string;
  category: ProviderCategory;
  city: string;
  headline: string | null;
  bio: string | null;
  photo_url: string | null;
  session_fee: number;
  languages: string[];
};

export type BookingRequest = {
  id: string;
  user_id: string;
  provider_id: string | null;
  preferred_day: string | null;
  preferred_slot: string | null;
  note: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
};

export type SessionRecord = {
  id: string;
  request_id: string | null;
  user_id: string;
  provider_id: string;
  held_on: string;
  fee: number;
  commission: number;
  collected: boolean;
  payment_ref: string | null;
  notes: string | null;
  created_at: string;
};

export type Checkin = {
  id: string;
  user_id: string;
  on_date: string;
  mood: Mood;
  note: string | null;
  created_at: string;
};

export type PlanTask = 'breathing' | 'walk' | 'water' | 'exercise' | 'reading';

export type DailyPlanItem = {
  id: string;
  user_id: string;
  on_date: string;
  task: PlanTask;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

export type ProfileUpdate = Partial<
  Pick<Profile, 'display_name' | 'avatar_url' | 'date_of_birth' | 'timezone' | 'locale' | 'onboarding_completed_at'>
>;

export type SettingsUpdate = Partial<
  Pick<UserSettings, 'theme' | 'notifications_enabled' | 'reminder_time' | 'daily_goal_minutes' | 'analytics_opt_in'>
>;

/**
 * Row-level security, not these types, is what actually protects the data.
 * Writes typed as possible here (providers, sessions) are still rejected by the
 * database for anyone without the staff flag — see 0003_pilot_marketplace.sql.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: ProfileUpdate;
        Relationships: [];
      };
      user_settings: {
        Row: UserSettings;
        Insert: Partial<UserSettings> & { user_id: string };
        Update: SettingsUpdate;
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      consents: {
        Row: ConsentRecord;
        Insert: Omit<ConsentRecord, 'id' | 'created_at'>;
        Update: Partial<Omit<ConsentRecord, 'id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      providers: {
        Row: ProviderPublic & { status: ProviderStatus };
        Insert: Partial<ProviderPublic>;
        Update: Partial<ProviderPublic>;
        Relationships: [];
      };
      booking_requests: {
        Row: BookingRequest;
        Insert: Pick<BookingRequest, 'user_id' | 'provider_id'> &
          Partial<Pick<BookingRequest, 'preferred_day' | 'preferred_slot' | 'note' | 'status'>>;
        Update: Partial<Pick<BookingRequest, 'status' | 'provider_id' | 'note'>>;
        Relationships: [
          {
            foreignKeyName: 'booking_requests_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'providers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: SessionRecord;
        Insert: Omit<SessionRecord, 'id' | 'created_at'>;
        Update: Partial<Omit<SessionRecord, 'id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'sessions_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'providers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      checkins: {
        Row: Checkin;
        Insert: Pick<Checkin, 'user_id' | 'mood'> & Partial<Pick<Checkin, 'on_date' | 'note'>>;
        Update: Partial<Pick<Checkin, 'mood' | 'note'>>;
        Relationships: [
          {
            foreignKeyName: 'checkins_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_plan_items: {
        Row: DailyPlanItem;
        // completed_at is server-set by a trigger — never accepted from the client.
        Insert: Pick<DailyPlanItem, 'user_id' | 'task'> & Partial<Pick<DailyPlanItem, 'on_date'>>;
        Update: Pick<DailyPlanItem, 'completed'>;
        Relationships: [
          {
            foreignKeyName: 'daily_plan_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      provider_directory: { Row: ProviderPublic; Relationships: [] };
      current_consents: { Row: Omit<ConsentRecord, 'id'>; Relationships: [] };
    };
    Functions: {
      export_my_data: { Args: Record<string, never>; Returns: unknown };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      my_streak: { Args: Record<string, never>; Returns: number };
    };
    Enums: {
      theme_pref: ThemePref;
      consent_kind: ConsentKind;
      provider_category: ProviderCategory;
      provider_status: ProviderStatus;
      request_status: RequestStatus;
      mood: Mood;
      plan_task: PlanTask;
    };
    CompositeTypes: Record<string, never>;
  };
}
