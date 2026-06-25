export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blog_posts: {
        Row: {
          author_id: string | null
          content: string
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          content?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          content?: string
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          merchant_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          merchant_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          merchant_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_campaigns: {
        Row: {
          category: string | null
          created_at: string
          discount_percent: number | null
          ends_at: string | null
          id: string
          is_active: boolean
          merchant_id: string | null
          min_amount: number | null
          min_qty: number | null
          name: string
          product_ids: Json
          starts_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          merchant_id?: string | null
          min_amount?: number | null
          min_qty?: number | null
          name: string
          product_ids?: Json
          starts_at?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          merchant_id?: string | null
          min_amount?: number | null
          min_qty?: number | null
          name?: string
          product_ids?: Json
          starts_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          merchant_id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          merchant_id: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          merchant_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_settings: {
        Row: {
          bot_name: string
          created_at: string
          greeting_message: string
          id: string
          is_enabled: boolean
          knowledge: string
          merchant_id: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          bot_name?: string
          created_at?: string
          greeting_message?: string
          id?: string
          is_enabled?: boolean
          knowledge?: string
          merchant_id: string
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          bot_name?: string
          created_at?: string
          greeting_message?: string
          id?: string
          is_enabled?: boolean
          knowledge?: string
          merchant_id?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          merchant_id: string
          min_order: number
          updated_at: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          merchant_id: string
          min_order?: number
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          merchant_id?: string
          min_order?: number
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_options: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          estimated_days_max: number
          estimated_days_min: number
          id: string
          is_active: boolean
          merchant_id: string
          name: string
          payment_terms: string | null
          phone: string | null
          position: number
          price: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          estimated_days_max?: number
          estimated_days_min?: number
          id?: string
          is_active?: boolean
          merchant_id: string
          name: string
          payment_terms?: string | null
          phone?: string | null
          position?: number
          price?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          estimated_days_max?: number
          estimated_days_min?: number
          id?: string
          is_active?: boolean
          merchant_id?: string
          name?: string
          payment_terms?: string | null
          phone?: string | null
          position?: number
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_options_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_requests: {
        Row: {
          assigned_at: string | null
          cancelled_at: string | null
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          dropoff_address: string | null
          external_ref: string | null
          fee: number
          id: string
          last_error: string | null
          merchant_id: string
          mode: string
          note: string | null
          order_id: string
          package_info: Json
          picked_up_at: string | null
          pickup_address: string | null
          provider: string | null
          recipient_name: string | null
          recipient_phone: string | null
          requested_at: string | null
          status: string
          tracking_sms_sent_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          dropoff_address?: string | null
          external_ref?: string | null
          fee?: number
          id?: string
          last_error?: string | null
          merchant_id: string
          mode?: string
          note?: string | null
          order_id: string
          package_info?: Json
          picked_up_at?: string | null
          pickup_address?: string | null
          provider?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          requested_at?: string | null
          status?: string
          tracking_sms_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          dropoff_address?: string | null
          external_ref?: string | null
          fee?: number
          id?: string
          last_error?: string | null
          merchant_id?: string
          mode?: string
          note?: string | null
          order_id?: string
          package_info?: Json
          picked_up_at?: string | null
          pickup_address?: string | null
          provider?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          requested_at?: string | null
          status?: string
          tracking_sms_sent_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      delivery_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          delivery_request_id: string
          id: string
          note: string | null
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          delivery_request_id: string
          id?: string
          note?: string | null
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          delivery_request_id?: string
          id?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_status_history_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_webhooks: {
        Row: {
          created_at: string
          delivery_request_id: string | null
          event: string | null
          fulfillment_status: string | null
          id: string
          merchant_id: string | null
          order_id: string | null
          payload: Json
        }
        Insert: {
          created_at?: string
          delivery_request_id?: string | null
          event?: string | null
          fulfillment_status?: string | null
          id?: string
          merchant_id?: string | null
          order_id?: string | null
          payload?: Json
        }
        Update: {
          created_at?: string
          delivery_request_id?: string | null
          event?: string | null
          fulfillment_status?: string | null
          id?: string
          merchant_id?: string | null
          order_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "delivery_webhooks_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      foreign_source_sync_jobs: {
        Row: {
          availability_changes_count: number
          created_at: string
          diagnostics: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          merchant_id: string
          price_changes_count: number
          product_id: string
          source: Database["public"]["Enums"]["foreign_source"]
          started_at: string | null
          status: string
          sync_type: string
          variants_available: number
          variants_checked: number
          variants_unavailable: number
          variants_unknown: number
        }
        Insert: {
          availability_changes_count?: number
          created_at?: string
          diagnostics?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          merchant_id: string
          price_changes_count?: number
          product_id: string
          source: Database["public"]["Enums"]["foreign_source"]
          started_at?: string | null
          status?: string
          sync_type?: string
          variants_available?: number
          variants_checked?: number
          variants_unavailable?: number
          variants_unknown?: number
        }
        Update: {
          availability_changes_count?: number
          created_at?: string
          diagnostics?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          merchant_id?: string
          price_changes_count?: number
          product_id?: string
          source?: Database["public"]["Enums"]["foreign_source"]
          started_at?: string | null
          status?: string
          sync_type?: string
          variants_available?: number
          variants_checked?: number
          variants_unavailable?: number
          variants_unknown?: number
        }
        Relationships: [
          {
            foreignKeyName: "foreign_source_sync_jobs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foreign_source_sync_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          barcode: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          merchant_id: string
          name: string
          quantity_available: number | null
          quantity_on_hand: number
          quantity_reserved: number
          sku: string | null
          source_cargo_id: string | null
          source_cargo_tracking_number: string | null
          source_type: string | null
          status: string
          store_id: string | null
          unit: string
          updated_at: string
          warehouse_location: string | null
        }
        Insert: {
          barcode?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          merchant_id: string
          name: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          sku?: string | null
          source_cargo_id?: string | null
          source_cargo_tracking_number?: string | null
          source_type?: string | null
          status?: string
          store_id?: string | null
          unit?: string
          updated_at?: string
          warehouse_location?: string | null
        }
        Update: {
          barcode?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          merchant_id?: string
          name?: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          sku?: string | null
          source_cargo_id?: string | null
          source_cargo_tracking_number?: string | null
          source_type?: string | null
          status?: string
          store_id?: string | null
          unit?: string
          updated_at?: string
          warehouse_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          after_quantity: number
          before_quantity: number
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string
          merchant_id: string
          movement_type: string
          note: string | null
          quantity: number
          source_reference: string | null
          source_type: string | null
          store_id: string | null
        }
        Insert: {
          after_quantity: number
          before_quantity: number
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id: string
          merchant_id: string
          movement_type: string
          note?: string | null
          quantity: number
          source_reference?: string | null
          source_type?: string | null
          store_id?: string | null
        }
        Update: {
          after_quantity?: number
          before_quantity?: number
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string
          merchant_id?: string
          movement_type?: string
          note?: string | null
          quantity?: number
          source_reference?: string | null
          source_type?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_product_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string
          is_active: boolean
          merchant_id: string
          product_id: string
          quantity_multiplier: number
          store_id: string | null
          sync_mode: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id: string
          is_active?: boolean
          merchant_id: string
          product_id: string
          quantity_multiplier?: number
          store_id?: string | null
          sync_mode?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string
          is_active?: boolean
          merchant_id?: string
          product_id?: string
          quantity_multiplier?: number
          store_id?: string | null
          sync_mode?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_links_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_links_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          confirmed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          inventory_item_id: string
          link_id: string | null
          merchant_id: string
          order_id: string
          order_item_index: number | null
          product_id: string | null
          quantity: number
          release_reason: string | null
          released_at: string | null
          status: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_item_id: string
          link_id?: string | null
          merchant_id: string
          order_id: string
          order_item_index?: number | null
          product_id?: string | null
          quantity: number
          release_reason?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_item_id?: string
          link_id?: string | null
          merchant_id?: string
          order_id?: string
          order_item_index?: number | null
          product_id?: string | null
          quantity?: number
          release_reason?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sync_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          inventory_item_id: string | null
          link_id: string | null
          merchant_id: string
          new_stock: number | null
          old_stock: number | null
          product_id: string | null
          sync_status: string
          trigger_source: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          inventory_item_id?: string | null
          link_id?: string | null
          merchant_id: string
          new_stock?: number | null
          old_stock?: number | null
          product_id?: string | null
          sync_status?: string
          trigger_source?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          inventory_item_id?: string | null
          link_id?: string | null
          merchant_id?: string
          new_stock?: number | null
          old_stock?: number | null
          product_id?: string | null
          sync_status?: string
          trigger_source?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sync_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sync_logs_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sync_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sync_logs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_stock_reservations: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          merchant_id: string
          order_id: string
          product_id: string
          quantity: number
          release_reason: string | null
          released_at: string | null
          status: string
          updated_at: string
          variant_key: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          order_id: string
          product_id: string
          quantity: number
          release_reason?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          variant_key: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          release_reason?: string | null
          released_at?: string | null
          status?: string
          updated_at?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_stock_reservations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_stock_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_foreign_source_settings: {
        Row: {
          checkout_freshness_required_hours: number
          created_at: string
          default_cargo_cost_mnt: number
          default_delivery_max_days: number
          default_delivery_min_days: number
          default_korea_domestic_shipping_krw: number
          default_korea_domestic_shipping_mnt: number
          default_local_delivery_cost_mnt: number
          default_profit_percent: number
          default_sync_frequency_hours: number
          enabled: boolean
          exchange_rate: number | null
          id: string
          merchant_id: string
          minimum_profit_mnt: number
          payment_fee_reserve_fixed_mnt: number
          payment_fee_reserve_percent: number
          price_change_threshold_mnt: number
          price_change_threshold_percent: number
          price_sync_mode: Database["public"]["Enums"]["price_sync_mode"]
          profit_base: string
          risk_buffer_fixed_mnt: number
          risk_buffer_percent: number
          rounding_rule: number
          source: Database["public"]["Enums"]["foreign_source"]
          updated_at: string
        }
        Insert: {
          checkout_freshness_required_hours?: number
          created_at?: string
          default_cargo_cost_mnt?: number
          default_delivery_max_days?: number
          default_delivery_min_days?: number
          default_korea_domestic_shipping_krw?: number
          default_korea_domestic_shipping_mnt?: number
          default_local_delivery_cost_mnt?: number
          default_profit_percent?: number
          default_sync_frequency_hours?: number
          enabled?: boolean
          exchange_rate?: number | null
          id?: string
          merchant_id: string
          minimum_profit_mnt?: number
          payment_fee_reserve_fixed_mnt?: number
          payment_fee_reserve_percent?: number
          price_change_threshold_mnt?: number
          price_change_threshold_percent?: number
          price_sync_mode?: Database["public"]["Enums"]["price_sync_mode"]
          profit_base?: string
          risk_buffer_fixed_mnt?: number
          risk_buffer_percent?: number
          rounding_rule?: number
          source: Database["public"]["Enums"]["foreign_source"]
          updated_at?: string
        }
        Update: {
          checkout_freshness_required_hours?: number
          created_at?: string
          default_cargo_cost_mnt?: number
          default_delivery_max_days?: number
          default_delivery_min_days?: number
          default_korea_domestic_shipping_krw?: number
          default_korea_domestic_shipping_mnt?: number
          default_local_delivery_cost_mnt?: number
          default_profit_percent?: number
          default_sync_frequency_hours?: number
          enabled?: boolean
          exchange_rate?: number | null
          id?: string
          merchant_id?: string
          minimum_profit_mnt?: number
          payment_fee_reserve_fixed_mnt?: number
          payment_fee_reserve_percent?: number
          price_change_threshold_mnt?: number
          price_change_threshold_percent?: number
          price_sync_mode?: Database["public"]["Enums"]["price_sync_mode"]
          profit_base?: string
          risk_buffer_fixed_mnt?: number
          risk_buffer_percent?: number
          rounding_rule?: number
          source?: Database["public"]["Enums"]["foreign_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_foreign_source_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_users: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_users_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          allowed_foreign_sources: Database["public"]["Enums"]["foreign_source"][]
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          business_type: string | null
          can_create_foreign_order_products: boolean
          commission_rate: number
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_api_key: string | null
          delivery_endpoint: string | null
          delivery_mode: string
          delivery_webhook_secret: string | null
          description: string | null
          followers_count: number
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          onlycargo_customer_code: string | null
          onlycargo_last_synced_at: string | null
          onlycargo_phone: string | null
          onlycargo_sync_error: string | null
          owner_id: string | null
          policy_return: string | null
          policy_shipping: string | null
          register_number: string | null
          rejection_reason: string | null
          shipping_config: Json
          slug: string
          social_facebook: string | null
          social_instagram: string | null
          updated_at: string
          use_platform_payment_fallback: boolean
          website_url: string | null
        }
        Insert: {
          allowed_foreign_sources?: Database["public"]["Enums"]["foreign_source"][]
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_type?: string | null
          can_create_foreign_order_products?: boolean
          commission_rate?: number
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_api_key?: string | null
          delivery_endpoint?: string | null
          delivery_mode?: string
          delivery_webhook_secret?: string | null
          description?: string | null
          followers_count?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          onlycargo_customer_code?: string | null
          onlycargo_last_synced_at?: string | null
          onlycargo_phone?: string | null
          onlycargo_sync_error?: string | null
          owner_id?: string | null
          policy_return?: string | null
          policy_shipping?: string | null
          register_number?: string | null
          rejection_reason?: string | null
          shipping_config?: Json
          slug: string
          social_facebook?: string | null
          social_instagram?: string | null
          updated_at?: string
          use_platform_payment_fallback?: boolean
          website_url?: string | null
        }
        Update: {
          allowed_foreign_sources?: Database["public"]["Enums"]["foreign_source"][]
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_type?: string | null
          can_create_foreign_order_products?: boolean
          commission_rate?: number
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_api_key?: string | null
          delivery_endpoint?: string | null
          delivery_mode?: string
          delivery_webhook_secret?: string | null
          description?: string | null
          followers_count?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          onlycargo_customer_code?: string | null
          onlycargo_last_synced_at?: string | null
          onlycargo_phone?: string | null
          onlycargo_sync_error?: string | null
          owner_id?: string | null
          policy_return?: string | null
          policy_shipping?: string | null
          register_number?: string | null
          rejection_reason?: string | null
          shipping_config?: Json
          slug?: string
          social_facebook?: string | null
          social_instagram?: string | null
          updated_at?: string
          use_platform_payment_fallback?: boolean
          website_url?: string | null
        }
        Relationships: []
      }
      notifications_log: {
        Row: {
          attempt: number
          channel: string
          created_at: string
          error: string | null
          event_type: string
          id: string
          merchant_id: string | null
          message: string | null
          order_id: string | null
          payload: Json | null
          provider: string | null
          recipient: string | null
          status: string
        }
        Insert: {
          attempt?: number
          channel?: string
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          merchant_id?: string | null
          message?: string | null
          order_id?: string | null
          payload?: Json | null
          provider?: string | null
          recipient?: string | null
          status?: string
        }
        Update: {
          attempt?: number
          channel?: string
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          merchant_id?: string | null
          message?: string | null
          order_id?: string | null
          payload?: Json | null
          provider?: string | null
          recipient?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch: string | null
          coupon_consumed_at: string | null
          coupon_discount: number
          coupon_id: string | null
          created_at: string
          delivery_fee: number
          delivery_option_id: string | null
          delivery_order_id: string | null
          delivery_status: string | null
          external_ref: string | null
          guest_name: string | null
          has_foreign_order_items: boolean
          has_ready_stock_items: boolean
          id: string
          is_guest: boolean
          items: Json
          legacy_metadata: Json
          merchant_id: string
          note: string | null
          paid_at: string | null
          payment_error: string | null
          payment_method: string
          payment_status: string
          phone: string | null
          platform_commission_amount: number | null
          platform_commission_rate: number | null
          qpay_invoice_id: string | null
          qpay_qr_image: string | null
          qpay_qr_text: string | null
          qpay_short_url: string | null
          qpay_urls: Json
          sale_date: string | null
          shipping_address: string | null
          source: string
          source_note: string | null
          source_order_id: string | null
          source_system: string
          status: string
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch?: string | null
          coupon_consumed_at?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_option_id?: string | null
          delivery_order_id?: string | null
          delivery_status?: string | null
          external_ref?: string | null
          guest_name?: string | null
          has_foreign_order_items?: boolean
          has_ready_stock_items?: boolean
          id?: string
          is_guest?: boolean
          items: Json
          legacy_metadata?: Json
          merchant_id: string
          note?: string | null
          paid_at?: string | null
          payment_error?: string | null
          payment_method?: string
          payment_status?: string
          phone?: string | null
          platform_commission_amount?: number | null
          platform_commission_rate?: number | null
          qpay_invoice_id?: string | null
          qpay_qr_image?: string | null
          qpay_qr_text?: string | null
          qpay_short_url?: string | null
          qpay_urls?: Json
          sale_date?: string | null
          shipping_address?: string | null
          source?: string
          source_note?: string | null
          source_order_id?: string | null
          source_system?: string
          status?: string
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch?: string | null
          coupon_consumed_at?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_option_id?: string | null
          delivery_order_id?: string | null
          delivery_status?: string | null
          external_ref?: string | null
          guest_name?: string | null
          has_foreign_order_items?: boolean
          has_ready_stock_items?: boolean
          id?: string
          is_guest?: boolean
          items?: Json
          legacy_metadata?: Json
          merchant_id?: string
          note?: string | null
          paid_at?: string | null
          payment_error?: string | null
          payment_method?: string
          payment_status?: string
          phone?: string | null
          platform_commission_amount?: number | null
          platform_commission_rate?: number | null
          qpay_invoice_id?: string | null
          qpay_qr_image?: string | null
          qpay_qr_text?: string | null
          qpay_short_url?: string | null
          qpay_urls?: Json
          sale_date?: string | null
          shipping_address?: string | null
          source?: string
          source_note?: string | null
          source_order_id?: string | null
          source_system?: string
          status?: string
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_option_id_fkey"
            columns: ["delivery_option_id"]
            isOneToOne: false
            referencedRelation: "delivery_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string
          deeplink: string | null
          id: string
          invoice_id: string | null
          is_platform_fallback: boolean
          last_error: string | null
          merchant_id: string | null
          order_id: string | null
          paid_at: string | null
          phone: string | null
          provider_id: string | null
          provider_response: Json | null
          provider_type: string
          qr_image: string | null
          qr_text: string | null
          request_id: string | null
          status: string
          updated_at: string
          urls: Json | null
        }
        Insert: {
          amount: number
          created_at?: string
          deeplink?: string | null
          id?: string
          invoice_id?: string | null
          is_platform_fallback?: boolean
          last_error?: string | null
          merchant_id?: string | null
          order_id?: string | null
          paid_at?: string | null
          phone?: string | null
          provider_id?: string | null
          provider_response?: Json | null
          provider_type: string
          qr_image?: string | null
          qr_text?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
          urls?: Json | null
        }
        Update: {
          amount?: number
          created_at?: string
          deeplink?: string | null
          id?: string
          invoice_id?: string | null
          is_platform_fallback?: boolean
          last_error?: string | null
          merchant_id?: string | null
          order_id?: string | null
          paid_at?: string | null
          phone?: string | null
          provider_id?: string | null
          provider_response?: Json | null
          provider_type?: string
          qr_image?: string | null
          qr_text?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
          urls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          config_status: string
          created_at: string
          credentials: Json
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_platform_managed: boolean
          last_tested_at: string | null
          logo_url: string | null
          merchant_id: string | null
          name: string
          position: number
          provider_type: string
          test_message: string | null
          updated_at: string
          use_platform_fallback: boolean
        }
        Insert: {
          config_status?: string
          created_at?: string
          credentials?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_platform_managed?: boolean
          last_tested_at?: string | null
          logo_url?: string | null
          merchant_id?: string | null
          name: string
          position?: number
          provider_type: string
          test_message?: string | null
          updated_at?: string
          use_platform_fallback?: boolean
        }
        Update: {
          config_status?: string
          created_at?: string
          credentials?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_platform_managed?: boolean
          last_tested_at?: string | null
          logo_url?: string | null
          merchant_id?: string | null
          name?: string
          position?: number
          provider_type?: string
          test_message?: string | null
          updated_at?: string
          use_platform_fallback?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_providers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          amount: number
          bank_account: Json | null
          created_at: string
          customer_phone: string | null
          expires_at: string | null
          id: string
          invoice_id: string | null
          invoice_url: string | null
          last_error: string | null
          last_sms_error: string | null
          merchant_id: string
          order_id: string
          paid_at: string | null
          payment_provider: string
          qr_image: string | null
          qr_text: string | null
          sms_attempts: number
          sms_sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account?: Json | null
          created_at?: string
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          last_error?: string | null
          last_sms_error?: string | null
          merchant_id: string
          order_id: string
          paid_at?: string | null
          payment_provider?: string
          qr_image?: string | null
          qr_text?: string | null
          sms_attempts?: number
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account?: Json | null
          created_at?: string
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          last_error?: string | null
          last_sms_error?: string | null
          merchant_id?: string
          order_id?: string
          paid_at?: string | null
          payment_provider?: string
          qr_image?: string | null
          qr_text?: string | null
          sms_attempts?: number
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_banners: {
        Row: {
          banner_image: string | null
          bg_gradient: string | null
          button_link: string | null
          button_text: string | null
          created_at: string
          id: string
          is_active: boolean
          position: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          banner_image?: string | null
          bg_gradient?: string | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          banner_image?: string | null
          bg_gradient?: string | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_transactions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          merchant_id: string
          order_id: string
          order_total: number
          status: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string
          id?: string
          merchant_id: string
          order_id: string
          order_total: number
          status?: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          merchant_id?: string
          order_id?: string
          order_total?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          availability_status: Database["public"]["Enums"]["variant_availability"]
          cargo_cost_mnt: number | null
          color_label: string | null
          created_at: string
          exchange_rate: number | null
          final_customer_price_mnt: number | null
          id: string
          is_purchasable: boolean
          is_visible: boolean
          korea_domestic_shipping_mnt: number | null
          label: string | null
          last_availability_sync_at: string | null
          last_price_sync_at: string | null
          local_delivery_cost_mnt: number | null
          manual_availability_override: boolean
          manual_availability_status: string | null
          manual_override_at: string | null
          manual_override_by: string | null
          manual_override_reason: string | null
          minimum_profit_mnt: number | null
          option_signature: string | null
          payment_fee_reserve_mnt: number | null
          previous_source_price: number | null
          price_review_required: boolean
          product_id: string
          profit_amount_mnt: number | null
          profit_percent: number | null
          risk_buffer_mnt: number | null
          rounded_customer_price_mnt: number | null
          size_label: string | null
          source_availability_raw_text: string | null
          source_availability_status: string | null
          source_currency: string | null
          source_price: number | null
          source_price_mnt: number | null
          source_variant_id: string | null
          unavailable_reason: string | null
          updated_at: string
        }
        Insert: {
          availability_status?: Database["public"]["Enums"]["variant_availability"]
          cargo_cost_mnt?: number | null
          color_label?: string | null
          created_at?: string
          exchange_rate?: number | null
          final_customer_price_mnt?: number | null
          id?: string
          is_purchasable?: boolean
          is_visible?: boolean
          korea_domestic_shipping_mnt?: number | null
          label?: string | null
          last_availability_sync_at?: string | null
          last_price_sync_at?: string | null
          local_delivery_cost_mnt?: number | null
          manual_availability_override?: boolean
          manual_availability_status?: string | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_reason?: string | null
          minimum_profit_mnt?: number | null
          option_signature?: string | null
          payment_fee_reserve_mnt?: number | null
          previous_source_price?: number | null
          price_review_required?: boolean
          product_id: string
          profit_amount_mnt?: number | null
          profit_percent?: number | null
          risk_buffer_mnt?: number | null
          rounded_customer_price_mnt?: number | null
          size_label?: string | null
          source_availability_raw_text?: string | null
          source_availability_status?: string | null
          source_currency?: string | null
          source_price?: number | null
          source_price_mnt?: number | null
          source_variant_id?: string | null
          unavailable_reason?: string | null
          updated_at?: string
        }
        Update: {
          availability_status?: Database["public"]["Enums"]["variant_availability"]
          cargo_cost_mnt?: number | null
          color_label?: string | null
          created_at?: string
          exchange_rate?: number | null
          final_customer_price_mnt?: number | null
          id?: string
          is_purchasable?: boolean
          is_visible?: boolean
          korea_domestic_shipping_mnt?: number | null
          label?: string | null
          last_availability_sync_at?: string | null
          last_price_sync_at?: string | null
          local_delivery_cost_mnt?: number | null
          manual_availability_override?: boolean
          manual_availability_status?: string | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_reason?: string | null
          minimum_profit_mnt?: number | null
          option_signature?: string | null
          payment_fee_reserve_mnt?: number | null
          previous_source_price?: number | null
          price_review_required?: boolean
          product_id?: string
          profit_amount_mnt?: number | null
          profit_percent?: number | null
          risk_buffer_mnt?: number | null
          rounded_customer_price_mnt?: number | null
          size_label?: string | null
          source_availability_raw_text?: string | null
          source_availability_status?: string | null
          source_currency?: string | null
          source_price?: number | null
          source_price_mnt?: number | null
          source_variant_id?: string | null
          unavailable_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          category: string | null
          colors: Json
          created_at: string
          default_delivery_max_days: number | null
          default_delivery_min_days: number | null
          description: string | null
          detail_media: Json
          discount: number
          foreign_source: Database["public"]["Enums"]["foreign_source"] | null
          gallery_images: Json
          id: string
          image_url: string | null
          is_active: boolean
          is_bogo: boolean
          is_new: boolean
          is_on_sale: boolean
          last_source_sync_at: string | null
          legacy_metadata: Json
          low_stock_warning: boolean
          merchant_id: string
          name: string
          next_sync_at: string | null
          original_price: number | null
          price: number
          product_code: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          sales: number
          sizes: Json
          slug: string | null
          source_country: string | null
          source_currency: string | null
          source_name: string | null
          source_product_id: string | null
          source_sync_error: string | null
          source_sync_status:
            | Database["public"]["Enums"]["source_sync_status"]
            | null
          source_system: string
          source_url: string | null
          specifications: Json
          stock_quantity: number
          sync_enabled: boolean
          sync_failure_count: number
          sync_frequency_hours: number
          thumbnail_url: string | null
          updated_at: string
          variant_stock: Json
        }
        Insert: {
          brand_id?: string | null
          category?: string | null
          colors?: Json
          created_at?: string
          default_delivery_max_days?: number | null
          default_delivery_min_days?: number | null
          description?: string | null
          detail_media?: Json
          discount?: number
          foreign_source?: Database["public"]["Enums"]["foreign_source"] | null
          gallery_images?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_bogo?: boolean
          is_new?: boolean
          is_on_sale?: boolean
          last_source_sync_at?: string | null
          legacy_metadata?: Json
          low_stock_warning?: boolean
          merchant_id: string
          name: string
          next_sync_at?: string | null
          original_price?: number | null
          price: number
          product_code?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sales?: number
          sizes?: Json
          slug?: string | null
          source_country?: string | null
          source_currency?: string | null
          source_name?: string | null
          source_product_id?: string | null
          source_sync_error?: string | null
          source_sync_status?:
            | Database["public"]["Enums"]["source_sync_status"]
            | null
          source_system?: string
          source_url?: string | null
          specifications?: Json
          stock_quantity?: number
          sync_enabled?: boolean
          sync_failure_count?: number
          sync_frequency_hours?: number
          thumbnail_url?: string | null
          updated_at?: string
          variant_stock?: Json
        }
        Update: {
          brand_id?: string | null
          category?: string | null
          colors?: Json
          created_at?: string
          default_delivery_max_days?: number | null
          default_delivery_min_days?: number | null
          description?: string | null
          detail_media?: Json
          discount?: number
          foreign_source?: Database["public"]["Enums"]["foreign_source"] | null
          gallery_images?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_bogo?: boolean
          is_new?: boolean
          is_on_sale?: boolean
          last_source_sync_at?: string | null
          legacy_metadata?: Json
          low_stock_warning?: boolean
          merchant_id?: string
          name?: string
          next_sync_at?: string | null
          original_price?: number | null
          price?: number
          product_code?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sales?: number
          sizes?: Json
          slug?: string | null
          source_country?: string | null
          source_currency?: string | null
          source_name?: string | null
          source_product_id?: string | null
          source_sync_error?: string | null
          source_sync_status?:
            | Database["public"]["Enums"]["source_sync_status"]
            | null
          source_system?: string
          source_url?: string | null
          specifications?: Json
          stock_quantity?: number
          sync_enabled?: boolean
          sync_failure_count?: number
          sync_frequency_hours?: number
          thumbnail_url?: string | null
          updated_at?: string
          variant_stock?: Json
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          shipping_address: string | null
          updated_at: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          shipping_address?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          shipping_address?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_banners: {
        Row: {
          banner_image: string | null
          button_link: string | null
          button_text: string | null
          created_at: string
          id: string
          is_active: boolean
          merchant_id: string
          position: number
          subtitle: string | null
          title: string
        }
        Insert: {
          banner_image?: string | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id: string
          position?: number
          subtitle?: string | null
          title: string
        }
        Update: {
          banner_image?: string | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          position?: number
          subtitle?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_banners_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      public_order_tokens: {
        Row: {
          created_at: string
          customer_phone: string | null
          expires_at: string
          id: string
          is_active: boolean
          last_accessed_at: string | null
          open_count: number
          order_id: string
          public_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_phone?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          open_count?: number
          order_id: string
          public_token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_phone?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          open_count?: number
          order_id?: string
          public_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_order_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          images: Json
          is_hidden: boolean
          merchant_id: string
          order_id: string | null
          product_id: string
          rating: number
          updated_at: string
          user_id: string
          verified_purchase: boolean
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          images?: Json
          is_hidden?: boolean
          merchant_id: string
          order_id?: string | null
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
          verified_purchase?: boolean
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          images?: Json
          is_hidden?: boolean
          merchant_id?: string
          order_id?: string | null
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_rules: {
        Row: {
          base_fee: number
          created_at: string
          express_available: boolean
          express_fee: number
          free_threshold: number | null
          id: string
          is_active: boolean
          merchant_id: string
          updated_at: string
          weekend_free: boolean
        }
        Insert: {
          base_fee?: number
          created_at?: string
          express_available?: boolean
          express_fee?: number
          free_threshold?: number | null
          id?: string
          is_active?: boolean
          merchant_id: string
          updated_at?: string
          weekend_free?: boolean
        }
        Update: {
          base_fee?: number
          created_at?: string
          express_available?: boolean
          express_fee?: number
          free_threshold?: number | null
          id?: string
          is_active?: boolean
          merchant_id?: string
          updated_at?: string
          weekend_free?: boolean
        }
        Relationships: []
      }
      source_purchase_queue: {
        Row: {
          created_at: string
          customer_paid_price_mnt: number | null
          id: string
          merchant_id: string
          notes: string | null
          order_id: string
          order_item_index: number
          selected_size_label: string | null
          source: Database["public"]["Enums"]["foreign_source"]
          source_currency: string | null
          source_price: number | null
          source_price_mnt: number | null
          source_product_id: string | null
          source_url: string | null
          source_variant_id: string | null
          status: Database["public"]["Enums"]["foreign_fulfillment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_paid_price_mnt?: number | null
          id?: string
          merchant_id: string
          notes?: string | null
          order_id: string
          order_item_index: number
          selected_size_label?: string | null
          source: Database["public"]["Enums"]["foreign_source"]
          source_currency?: string | null
          source_price?: number | null
          source_price_mnt?: number | null
          source_product_id?: string | null
          source_url?: string | null
          source_variant_id?: string | null
          status?: Database["public"]["Enums"]["foreign_fulfillment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_paid_price_mnt?: number | null
          id?: string
          merchant_id?: string
          notes?: string | null
          order_id?: string
          order_item_index?: number
          selected_size_label?: string | null
          source?: Database["public"]["Enums"]["foreign_source"]
          source_currency?: string | null
          source_price?: number | null
          source_price_mnt?: number | null
          source_product_id?: string | null
          source_url?: string | null
          source_variant_id?: string | null
          status?: Database["public"]["Enums"]["foreign_fulfillment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_purchase_queue_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_purchase_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          merchant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_key: string
          id: string
          merchant_id: string | null
          order_id: string | null
          payload: Json | null
          processed_at: string
          processing_status: string
          provider: string
          result: Json | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_key: string
          id?: string
          merchant_id?: string | null
          order_id?: string | null
          payload?: Json | null
          processed_at?: string
          processing_status?: string
          provider: string
          result?: Json | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_key?: string
          id?: string
          merchant_id?: string | null
          order_id?: string | null
          payload?: Json | null
          processed_at?: string
          processing_status?: string
          provider?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_inventory_reservations: {
        Args: { _order_id: string }
        Returns: Json
      }
      confirm_legacy_stock_reservations: {
        Args: { _order_id: string }
        Returns: Json
      }
      consume_coupon: { Args: { _coupon_id: string }; Returns: boolean }
      consume_coupon_for_order: { Args: { _order_id: string }; Returns: Json }
      create_inventory_from_cargo: {
        Args: {
          _cargo_id: string
          _cost_price: number
          _created_by: string
          _merchant_id: string
          _name: string
          _note: string
          _quantity: number
          _sku: string
          _tracking_number: string
          _unit: string
          _warehouse_location: string
        }
        Returns: string
      }
      decrement_variant_stocks: { Args: { _items: Json }; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_inventory_reservations: { Args: never; Returns: Json }
      expire_unpaid_orders: { Args: { _minutes?: number }; Returns: Json }
      has_merchant_access: {
        Args: { _merchant_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_merchant_owner: {
        Args: { _merchant_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      release_inventory_reservations: {
        Args: { _order_id: string; _reason?: string }
        Returns: Json
      }
      release_legacy_stock_reservations: {
        Args: { _order_id: string; _reason?: string }
        Returns: Json
      }
      reserve_inventory_for_order: {
        Args: {
          _expires_minutes?: number
          _items: Json
          _merchant_id: string
          _order_id: string
        }
        Returns: Json
      }
      reserve_legacy_stock_for_order: {
        Args: { _items: Json; _merchant_id: string; _order_id: string }
        Returns: Json
      }
      restore_variant_stocks: { Args: { _items: Json }; Returns: undefined }
      sync_inventory_link: {
        Args: { _link_id: string; _trigger?: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "platform_admin"
        | "merchant_owner"
        | "merchant_admin"
        | "merchant_moderator"
        | "merchant_driver"
      foreign_fulfillment_status:
        | "PAID"
        | "WAITING_SOURCE_PURCHASE"
        | "SOURCE_PURCHASED"
        | "KOREA_WAREHOUSE_RECEIVED"
        | "INTERNATIONAL_TRANSIT"
        | "UB_ARRIVED"
        | "DELIVERY_ASSIGNED"
        | "DELIVERED"
        | "SOURCE_PURCHASE_FAILED"
        | "REFUNDED"
        | "CANCELLED"
      foreign_source:
        | "POIZON_KR"
        | "DEWU_CN"
        | "TAOBAO"
        | "TMALL"
        | "ALIBABA_1688"
        | "AMAZON"
        | "MANUAL_EXTERNAL"
      price_sync_mode:
        | "AUTO_UPDATE_CUSTOMER_PRICE"
        | "REVIEW_BEFORE_UPDATE"
        | "AVAILABILITY_ONLY"
      product_type: "READY_STOCK" | "FOREIGN_ORDER"
      source_sync_status: "OK" | "PENDING" | "FAILED" | "NEEDS_REVIEW"
      variant_availability:
        | "AVAILABLE"
        | "UNAVAILABLE"
        | "UNKNOWN"
        | "NEEDS_REVIEW"
        | "LOW_STOCK"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "platform_admin",
        "merchant_owner",
        "merchant_admin",
        "merchant_moderator",
        "merchant_driver",
      ],
      foreign_fulfillment_status: [
        "PAID",
        "WAITING_SOURCE_PURCHASE",
        "SOURCE_PURCHASED",
        "KOREA_WAREHOUSE_RECEIVED",
        "INTERNATIONAL_TRANSIT",
        "UB_ARRIVED",
        "DELIVERY_ASSIGNED",
        "DELIVERED",
        "SOURCE_PURCHASE_FAILED",
        "REFUNDED",
        "CANCELLED",
      ],
      foreign_source: [
        "POIZON_KR",
        "DEWU_CN",
        "TAOBAO",
        "TMALL",
        "ALIBABA_1688",
        "AMAZON",
        "MANUAL_EXTERNAL",
      ],
      price_sync_mode: [
        "AUTO_UPDATE_CUSTOMER_PRICE",
        "REVIEW_BEFORE_UPDATE",
        "AVAILABILITY_ONLY",
      ],
      product_type: ["READY_STOCK", "FOREIGN_ORDER"],
      source_sync_status: ["OK", "PENDING", "FAILED", "NEEDS_REVIEW"],
      variant_availability: [
        "AVAILABLE",
        "UNAVAILABLE",
        "UNKNOWN",
        "NEEDS_REVIEW",
        "LOW_STOCK",
      ],
    },
  },
} as const
