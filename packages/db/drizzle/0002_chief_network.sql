CREATE TABLE "shared_template" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'web' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source_project_id" text NOT NULL,
	"source_code" text,
	"template_type" varchar(10) DEFAULT '0' NOT NULL,
	"creator_user_id" text NOT NULL,
	"creator_organization_id" text NOT NULL,
	"creator_plan_at_share" varchar NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_approved" boolean DEFAULT true NOT NULL,
	"thumbnail_url" text,
	"preview_url" text,
	"stats_views" integer DEFAULT 0 NOT NULL,
	"stats_remakes" integer DEFAULT 0 NOT NULL,
	"stats_likes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_template_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "template_like" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"user_user_id" text NOT NULL,
	"user_organization_id" text NOT NULL,
	"user_plan" varchar,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_like_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "template_remake" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"user_user_id" text NOT NULL,
	"user_organization_id" text NOT NULL,
	"user_plan" varchar,
	"project_id" text,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_remake_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "template_view" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"viewer_user_id" text,
	"viewer_organization_id" text,
	"viewer_plan" varchar,
	"ip_address" varchar(45),
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_view_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "template_like" ADD CONSTRAINT "template_like_template_id_shared_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shared_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_remake" ADD CONSTRAINT "template_remake_template_id_shared_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shared_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_view" ADD CONSTRAINT "template_view_template_id_shared_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shared_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_template_creator_idx" ON "shared_template" USING btree ("creator_user_id");--> statement-breakpoint
CREATE INDEX "shared_template_category_idx" ON "shared_template" USING btree ("category");--> statement-breakpoint
CREATE INDEX "shared_template_public_idx" ON "shared_template" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "shared_template_featured_idx" ON "shared_template" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "shared_template_created_at_idx" ON "shared_template" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shared_template_popularity_idx" ON "shared_template" USING btree ("stats_remakes","stats_views","stats_likes");--> statement-breakpoint
CREATE INDEX "template_like_template_idx" ON "template_like" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_like_user_idx" ON "template_like" USING btree ("user_user_id");--> statement-breakpoint
CREATE INDEX "template_like_unique_idx" ON "template_like" USING btree ("template_id","user_user_id");--> statement-breakpoint
CREATE INDEX "template_remake_template_idx" ON "template_remake" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_remake_user_idx" ON "template_remake" USING btree ("user_user_id");--> statement-breakpoint
CREATE INDEX "template_remake_created_at_idx" ON "template_remake" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "template_view_template_idx" ON "template_view" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_view_viewer_idx" ON "template_view" USING btree ("viewer_user_id");--> statement-breakpoint
CREATE INDEX "template_view_created_at_idx" ON "template_view" USING btree ("created_at");