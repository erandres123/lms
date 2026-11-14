CREATE TABLE "grade_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight" double precision NOT NULL,
	"sequence" smallint DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"max_score" double precision NOT NULL,
	"competency_code" text,
	"due_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"grade" double precision NOT NULL,
	"reason" text NOT NULL,
	"overridden_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"entered_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"school_year" text NOT NULL,
	"sequence" smallint NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grade_categories" ADD CONSTRAINT "grade_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_categories" ADD CONSTRAINT "grade_categories_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_categories" ADD CONSTRAINT "grade_categories_period_id_grading_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."grading_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_period_id_grading_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."grading_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_category_id_grade_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."grade_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_period_id_grading_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."grading_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_overrides" ADD CONSTRAINT "grade_overrides_overridden_by_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_item_id_grade_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."grade_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_periods" ADD CONSTRAINT "grading_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grade_categories_section_period_name_key" ON "grade_categories" USING btree ("section_id","period_id","name");--> statement-breakpoint
CREATE INDEX "grade_categories_tenant_section_idx" ON "grade_categories" USING btree ("tenant_id","section_id","period_id");--> statement-breakpoint
CREATE INDEX "grade_items_tenant_section_period_idx" ON "grade_items" USING btree ("tenant_id","section_id","period_id");--> statement-breakpoint
CREATE INDEX "grade_items_category_idx" ON "grade_items" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grade_overrides_section_period_student_key" ON "grade_overrides" USING btree ("section_id","period_id","student_id");--> statement-breakpoint
CREATE INDEX "grade_overrides_tenant_section_idx" ON "grade_overrides" USING btree ("tenant_id","section_id","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grades_item_student_key" ON "grades" USING btree ("item_id","student_id");--> statement-breakpoint
CREATE INDEX "grades_tenant_item_idx" ON "grades" USING btree ("tenant_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grading_periods_tenant_year_sequence_key" ON "grading_periods" USING btree ("tenant_id","school_year","sequence");