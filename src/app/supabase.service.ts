
import { Injectable } from '@angular/core';
import {
  createClient,
  SupabaseClient,
  User
} from '@supabase/supabase-js';

import { environment } from '../environments/environment';

import {
  Bill,
  BillItem,
  BillPayment,
  Group,
  Member
} from './models';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {

  readonly configured: boolean =
    !!environment.supabaseUrl &&
    environment.supabaseUrl.startsWith('https://') &&
    !!environment.supabaseKey &&
    environment.supabaseKey.startsWith('sb_publishable_');

  readonly client: SupabaseClient | null = this.configured
    ? createClient(
        environment.supabaseUrl,
        environment.supabaseKey
      )
    : null;
