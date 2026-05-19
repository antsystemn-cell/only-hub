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
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          business_type: string | null
          commission_rate: number
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_api_key: string | null
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          owner_id: string | null
          register_number: string | null
          rejection_reason: string | null
          slug: string
          social_facebook: string | null
          social_instagram: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_type?: string | null
          commission_rate?: number
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_api_key?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          owner_id?: string | null
          register_number?: string | null
          rejection_reason?: string | null
          slug: string
          social_facebook?: string | null
          social_instagram?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_type?: string | null
          commission_rate?: number
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_api_key?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          register_number?: string | null
          rejection_reason?: string | null
          slug?: string
          social_facebook?: string | null
          social_instagram?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          branch: string | null
          coupon_discount: number
          coupon_id: string | null
          created_at: string
          delivery_fee: number
          delivery_option_id: string | null
          delivery_order_id: string | null
          delivery_status: string | null
          external_ref: string | null
          guest_name: string | null
          id: string
          is_guest: boolean
          items: Json
          merchant_id: string
          note: string | null
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
          status: string
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_option_id?: string | null
          delivery_order_id?: string | null
          delivery_status?: string | null
          external_ref?: string | null
          guest_name?: string | null
          id?: string
          is_guest?: boolean
          items: Json
          merchant_id: string
          note?: string | null
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
          status?: string
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_option_id?: string | null
          delivery_order_id?: string | null
          delivery_status?: string | null
          external_ref?: string | null
          guest_name?: string | null
          id?: string
          is_guest?: boolean
          items?: Json
          merchant_id?: string
          note?: string | null
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
      payment_providers: {
        Row: {
          created_at: string
          credentials: Json
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          merchant_id: string
          name: string
          position: number
          provider_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          merchant_id: string
          name: string
          position?: number
          provider_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          merchant_id?: string
          name?: string
          position?: number
          provider_type?: string
          updated_at?: string
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
      products: {
        Row: {
          brand_id: string | null
          category: string | null
          colors: Json
          created_at: string
          description: string | null
          detail_media: Json
          discount: number
          gallery_images: Json
          id: string
          image_url: string | null
          is_active: boolean
          is_bogo: boolean
          is_new: boolean
          is_on_sale: boolean
          merchant_id: string
          name: string
          original_price: number | null
          price: number
          product_code: string | null
          sales: number
          sizes: Json
          slug: string | null
          specifications: Json
          stock_quantity: number
          thumbnail_url: string | null
          updated_at: string
          variant_stock: Json
        }
        Insert: {
          brand_id?: string | null
          category?: string | null
          colors?: Json
          created_at?: string
          description?: string | null
          detail_media?: Json
          discount?: number
          gallery_images?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_bogo?: boolean
          is_new?: boolean
          is_on_sale?: boolean
          merchant_id: string
          name: string
          original_price?: number | null
          price: number
          product_code?: string | null
          sales?: number
          sizes?: Json
          slug?: string | null
          specifications?: Json
          stock_quantity?: number
          thumbnail_url?: string | null
          updated_at?: string
          variant_stock?: Json
        }
        Update: {
          brand_id?: string | null
          category?: string | null
          colors?: Json
          created_at?: string
          description?: string | null
          detail_media?: Json
          discount?: number
          gallery_images?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_bogo?: boolean
          is_new?: boolean
          is_on_sale?: boolean
          merchant_id?: string
          name?: string
          original_price?: number | null
          price?: number
          product_code?: string | null
          sales?: number
          sizes?: Json
          slug?: string | null
          specifications?: Json
          stock_quantity?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
    }
    Enums: {
      app_role:
        | "platform_admin"
        | "merchant_owner"
        | "merchant_admin"
        | "merchant_moderator"
        | "merchant_driver"
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
    },
  },
} as const
