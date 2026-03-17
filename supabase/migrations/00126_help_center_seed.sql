-- Seed initial help center categories and documentation
-- This provides the foundational knowledge base for the chatbot and help center.

-- ============================================================
-- Categories
-- ============================================================
INSERT INTO help_categories (slug, title, description, icon, sort_order) VALUES
  ('getting-started', 'Getting Started', 'Learn the basics of setting up and using RouteFlex for your recruiting needs.', 'rocket', 1),
  ('managing-jobs', 'Managing Jobs', 'Create, configure, and manage job postings for your FedEx Ground routes.', 'clipboard-list', 2),
  ('applicant-management', 'Applicant Management', 'Track, review, and manage applicants through your hiring pipeline.', 'users', 3),
  ('automation', 'Automation', 'Set up automated workflows for emails, SMS, phone calls, and more.', 'zap', 4),
  ('screening', 'Screening', 'Configure screening questions and automated candidate evaluation.', 'shield', 5),
  ('account-settings', 'Account & Settings', 'Manage your account, team members, integrations, and preferences.', 'settings', 6),
  ('billing', 'Billing & Plans', 'Understanding your plan, billing, and payment information.', 'credit-card', 7),
  ('troubleshooting', 'Troubleshooting', 'Common issues and how to resolve them.', 'help-circle', 8);

-- ============================================================
-- Getting Started articles
-- ============================================================
INSERT INTO help_articles (category_id, slug, title, summary, content, tags, sort_order) VALUES
(
  (SELECT id FROM help_categories WHERE slug = 'getting-started'),
  'welcome-to-routeflex',
  'Welcome to RouteFlex',
  'An overview of what RouteFlex is and how it helps FedEx Ground contractors hire drivers.',
  '## What is RouteFlex?

RouteFlex is an AI-powered recruiting platform built specifically for FedEx Ground contractors. It helps you build a team of AI agents that manages your entire hiring pipeline — from application to first day on route.

### Key Features

- **AI-Powered Pipeline**: Automated screening, communication, and candidate management
- **Smart Job Postings**: Create job listings optimized for FedEx Ground driver positions
- **Automated Communication**: AI agents handle emails, SMS, and even phone calls with applicants
- **Knowledge Base**: Train your AI agents with company-specific information
- **Screening & Evaluation**: Automated candidate screening with customizable questions
- **Board View**: Visual pipeline management similar to a Kanban board

### Who is RouteFlex for?

RouteFlex is designed for FedEx Ground contractors (CSPs and ISPs) who need to:
- Hire delivery drivers efficiently
- Reduce time spent on repetitive recruiting tasks
- Maintain consistent communication with applicants
- Scale their hiring process across multiple routes or locations',
  ARRAY['overview', 'introduction', 'basics'],
  1
),
(
  (SELECT id FROM help_categories WHERE slug = 'getting-started'),
  'creating-your-account',
  'Creating Your Account',
  'Step-by-step guide to signing up and setting up your RouteFlex account.',
  '## Creating Your Account

### Step 1: Sign Up

Visit the RouteFlex website and click "Get Early Access" or "Log In" to create your account.

### Step 2: Create Your Company

After signing in, you''ll be prompted to create your company profile:
1. Enter your company name (your contracting company name)
2. This creates your workspace where you''ll manage all your jobs and applicants

### Step 3: Create Your First Job

Once your company is set up, create your first job posting:
1. Click "Create Job" in the sidebar
2. Enter the job title (e.g., "FedEx Ground Delivery Driver")
3. Configure your job settings and requirements

### Step 4: Set Up Your Application Form

Customize the application form applicants will fill out:
1. Navigate to your job''s "Form" section
2. Add or customize fields relevant to your position
3. Your form URL can be shared with potential applicants

### Next Steps

- Set up your [Knowledge Base](/help-center/automation) to train AI agents
- Configure [Screening Questions](/help-center/screening) for automated evaluation
- Set up [Automations](/help-center/automation) for email and SMS follow-ups',
  ARRAY['signup', 'onboarding', 'setup'],
  2
),
(
  (SELECT id FROM help_categories WHERE slug = 'getting-started'),
  'navigating-the-dashboard',
  'Navigating the Dashboard',
  'Learn your way around the RouteFlex dashboard and its key sections.',
  '## Dashboard Navigation

### Sidebar

The left sidebar is your main navigation hub:

- **Jobs**: Switch between different job postings. Each job has its own pipeline, applicants, and settings.
- **Board**: Your Kanban-style pipeline view showing applicants in different stages
- **Form**: Customize the application form for each job
- **Screening**: Set up screening questions and view responses
- **Knowledge Base**: Manage Q&A pairs that train your AI agents

### Top Bar

- **Company Selector**: Switch between companies if you manage multiple
- **Notifications**: Bell icon shows system notifications and agent updates
- **User Menu**: Access your profile and account settings

### Board View

The board is where you''ll spend most of your time:
- Drag and drop applicants between pipeline stages
- Click on an applicant card to view their full profile
- Use filters and search to find specific applicants
- Pipeline stages can be customized for each job',
  ARRAY['navigation', 'dashboard', 'ui'],
  3
);

-- ============================================================
-- Managing Jobs articles
-- ============================================================
INSERT INTO help_articles (category_id, slug, title, summary, content, tags, sort_order) VALUES
(
  (SELECT id FROM help_categories WHERE slug = 'managing-jobs'),
  'creating-a-job-posting',
  'Creating a Job Posting',
  'How to create and configure a new job posting in RouteFlex.',
  '## Creating a Job Posting

### Creating a New Job

1. Click the **"+"** button next to "Jobs" in the sidebar
2. Enter a job title and description
3. Click "Create" to set up the job

### Configuring Your Job

After creating a job, configure these essential sections:

#### Application Form
Navigate to **Form** to customize what information you collect from applicants:
- Personal information (name, email, phone)
- Driving experience and qualifications
- Availability and schedule preferences
- Custom fields specific to your needs

#### Pipeline Stages
Your board comes with default pipeline stages. You can customize these to match your hiring workflow:
- New Applications
- Screening
- Interview
- Background Check
- Offer
- Hired

#### Knowledge Base
Add Q&A pairs to the Knowledge Base section. These are used by AI agents when communicating with applicants about this specific job.

### Sharing Your Job

Once configured, share your job''s application form URL with potential applicants. The URL can be found in the Form section of your job.',
  ARRAY['jobs', 'posting', 'create'],
  1
),
(
  (SELECT id FROM help_categories WHERE slug = 'managing-jobs'),
  'customizing-your-pipeline',
  'Customizing Your Pipeline',
  'How to set up and customize pipeline stages for your hiring workflow.',
  '## Customizing Your Pipeline

### Understanding Pipeline Stages

Your pipeline represents the stages an applicant goes through in your hiring process. Each stage is a column on your board view.

### Default Stages

RouteFlex provides default stages that work for most FedEx Ground hiring:
1. **New** — Freshly submitted applications
2. **Screening** — Applicants being evaluated
3. **Interview** — Scheduled or completed interviews
4. **Background Check** — Running background verification
5. **Offer** — Extending job offers
6. **Hired** — Accepted and onboarded

### Managing Applicants in the Pipeline

- **Drag & Drop**: Move applicant cards between stages
- **Bulk Actions**: Select multiple applicants for batch operations
- **Filters**: Filter the board by stage, date, or custom fields
- **Archive**: Remove applicants who are no longer active from the board view',
  ARRAY['pipeline', 'stages', 'board', 'kanban'],
  2
);

-- ============================================================
-- Automation articles
-- ============================================================
INSERT INTO help_articles (category_id, slug, title, summary, content, tags, sort_order) VALUES
(
  (SELECT id FROM help_categories WHERE slug = 'automation'),
  'introduction-to-automations',
  'Introduction to Automations',
  'Learn how RouteFlex automations work to streamline your recruiting process.',
  '## Introduction to Automations

### What are Automations?

Automations are rule-based workflows that execute actions automatically when certain triggers occur. They allow you to:
- Automatically send emails or SMS to new applicants
- Schedule follow-up communications
- Move applicants through pipeline stages
- Trigger AI-powered actions like resume scoring

### How Automations Work

Each automation consists of:
1. **Trigger**: The event that starts the automation (e.g., "new application received")
2. **Actions**: What happens when the trigger fires (e.g., "send welcome email")
3. **Conditions**: Optional filters to control when the automation runs

### Common Automation Examples

- **Welcome Email**: Send an email when a new application is submitted
- **Follow-up SMS**: Text applicants who haven''t responded in 48 hours
- **Stage Notification**: Alert your team when an applicant reaches a specific stage
- **Auto-Screening**: Automatically score applicants based on their responses

### Setting Up an Automation

1. Navigate to your job settings
2. Go to the Automations section
3. Click "Create Automation"
4. Select a trigger event
5. Configure the action(s)
6. Enable the automation',
  ARRAY['automation', 'workflows', 'triggers', 'actions'],
  1
),
(
  (SELECT id FROM help_categories WHERE slug = 'automation'),
  'using-the-knowledge-base',
  'Using the Knowledge Base',
  'How to set up and manage your knowledge base for AI agent training.',
  '## Using the Knowledge Base

### What is the Knowledge Base?

The Knowledge Base is a collection of question-and-answer pairs that train your AI agents. When agents communicate with applicants (via email, SMS, or phone), they reference the knowledge base to provide accurate, consistent answers.

### Adding Entries

1. Navigate to **Knowledge Base** in your job''s sidebar
2. Click "Add Entry"
3. Enter a question and its corresponding answer
4. Save the entry

### Tips for Effective Knowledge Base Entries

- **Be specific**: Write questions the way applicants would ask them
- **Be comprehensive**: Include all relevant details in answers
- **Stay current**: Update entries when information changes
- **Cover common topics**: Pay rates, schedules, requirements, benefits

### Example Entries

**Q:** What is the pay rate for this position?
**A:** Starting pay is $X per hour. Routes typically take 8-10 hours. Weekly pay is every Friday via direct deposit.

**Q:** What are the requirements for this job?
**A:** You must be 21+, have a valid driver''s license, pass a background check, and be able to lift up to 75 lbs.

### AI Polishing

Use the "Polish" feature to have AI improve the clarity and professionalism of your entries. This ensures consistent tone across all your knowledge base content.

### Agent Assignment

You can assign knowledge base entries to specific automation agents, so different agents can have different knowledge scopes.',
  ARRAY['knowledge-base', 'ai', 'agents', 'training'],
  2
),
(
  (SELECT id FROM help_categories WHERE slug = 'automation'),
  'email-and-sms-templates',
  'Email & SMS Templates',
  'How to create and use email and SMS templates in your automations.',
  '## Email & SMS Templates

### Template Variables

Templates support dynamic variables that get replaced with actual data:
- `{{applicant_name}}` — Applicant''s full name
- `{{applicant_email}}` — Applicant''s email address
- `{{applicant_phone}}` — Applicant''s phone number
- `{{job_title}}` — The job title
- `{{company_name}}` — Your company name
- `{{knowledge_base}}` — Injects relevant knowledge base content

### Creating Email Templates

1. Go to the Template Center (if you have access)
2. Click "Create Template"
3. Choose "Email" as the template type
4. Write your subject line and body using variables
5. Save and use in automations

### SMS Best Practices

- Keep messages under 160 characters when possible
- Include a clear call to action
- Identify yourself and your company
- Respect opt-out requests

### Using Templates in Automations

When setting up an automation action:
1. Select "Send Email" or "Send SMS" as the action
2. Choose an existing template or write a custom message
3. Configure any additional settings (delay, conditions)
4. The template variables will be automatically filled in when the automation runs',
  ARRAY['email', 'sms', 'templates', 'communication'],
  3
);

-- ============================================================
-- Applicant Management articles
-- ============================================================
INSERT INTO help_articles (category_id, slug, title, summary, content, tags, sort_order) VALUES
(
  (SELECT id FROM help_categories WHERE slug = 'applicant-management'),
  'reviewing-applicants',
  'Reviewing Applicants',
  'How to view, filter, and manage applicant profiles on your board.',
  '## Reviewing Applicants

### Viewing Applicant Profiles

Click on any applicant card on the board to view their full profile, which includes:
- Contact information
- Application form responses
- Screening scores (if screening is configured)
- Communication history
- Activity timeline

### Filtering and Searching

Use the board''s built-in tools to find specific applicants:
- **Search**: Search by name, email, or phone number
- **Stage Filter**: View applicants in specific pipeline stages
- **Date Range**: Filter by application date

### Moving Applicants

- **Drag & Drop**: Move cards between columns on the board
- **Profile Actions**: Use the actions menu in an applicant''s profile to change their stage

### Archiving Applicants

To remove an applicant from your active pipeline without deleting their data:
1. Open the applicant''s profile
2. Click the archive option
3. The applicant will be moved to the archive and can be restored later',
  ARRAY['applicants', 'review', 'profiles', 'board'],
  1
);

-- ============================================================
-- Screening articles
-- ============================================================
INSERT INTO help_articles (category_id, slug, title, summary, content, tags, sort_order) VALUES
(
  (SELECT id FROM help_categories WHERE slug = 'screening'),
  'setting-up-screening',
  'Setting Up Screening Questions',
  'How to configure automated screening for your job applicants.',
  '## Setting Up Screening Questions

### What is Screening?

Screening allows you to ask applicants additional questions after they submit their application. AI automatically scores their responses to help you identify the best candidates.

### Creating Screening Questions

1. Navigate to the **Screening** section of your job
2. Click "Add Question" or use a template
3. Write your screening question
4. Optionally define what a good answer looks like (scoring criteria)
5. Save and enable screening

### Types of Questions

- **Experience**: "Describe your delivery driving experience"
- **Availability**: "What days and hours are you available to work?"
- **Qualifications**: "Do you have a valid driver''s license?"
- **Situational**: "How would you handle a delivery to an address you can''t find?"

### AI Scoring

RouteFlex uses AI to score screening responses based on:
- Relevance to the question
- Depth and quality of the answer
- Alignment with your defined criteria

Scores help you quickly identify promising candidates without reading every response manually.

### Using Templates

The screening template library provides pre-built question sets optimized for FedEx Ground driver hiring. You can use them as-is or customize them for your needs.',
  ARRAY['screening', 'questions', 'scoring', 'evaluation'],
  1
);

-- ============================================================
-- Account & Settings articles
-- ============================================================
INSERT INTO help_articles (category_id, slug, title, summary, content, tags, sort_order) VALUES
(
  (SELECT id FROM help_categories WHERE slug = 'account-settings'),
  'managing-your-account',
  'Managing Your Account',
  'How to update your profile, manage team members, and configure settings.',
  '## Managing Your Account

### Profile Settings

Access your account settings through the user menu in the top-right corner:
- Update your name and email
- Change your password
- Manage notification preferences

### Company Settings

Navigate to **Settings** in the sidebar to manage:
- Company name and details
- Team member access (invite colleagues to your workspace)
- Integration settings (Gmail, eSign, background check providers)
- API access and webhooks

### Team Members

To invite a team member:
1. Go to Settings
2. Navigate to the Team section
3. Enter their email address
4. Assign appropriate permissions
5. They''ll receive an email invitation to join your workspace

### Integrations

RouteFlex integrates with:
- **Gmail**: Send emails directly from your Gmail account
- **Adobe Sign / eSign**: Send and manage electronic documents
- **Background Check Providers**: Initiate background checks through FADV
- **Webhooks**: Send data to external systems when events occur',
  ARRAY['account', 'settings', 'team', 'integrations'],
  1
);

-- ============================================================
-- Troubleshooting articles
-- ============================================================
INSERT INTO help_articles (category_id, slug, title, summary, content, tags, sort_order) VALUES
(
  (SELECT id FROM help_categories WHERE slug = 'troubleshooting'),
  'common-issues',
  'Common Issues & Solutions',
  'Solutions to frequently encountered problems when using RouteFlex.',
  '## Common Issues & Solutions

### Applicants Not Receiving Emails

**Possible causes:**
- Gmail integration not connected — go to Settings > Integrations to connect your Gmail
- Email automation not enabled — check that your automation is turned on
- Email in spam — ask the applicant to check their spam/junk folder

**Solution:**
1. Verify your Gmail integration is active in Settings
2. Check the automation is enabled and configured correctly
3. Review the applicant''s activity log for delivery status

### Board Not Showing Applicants

**Possible causes:**
- Filters are active that hide some applicants
- Applicants may be archived

**Solution:**
1. Clear all active filters on the board
2. Check the archive section for hidden applicants

### Screening Scores Not Appearing

**Possible causes:**
- Screening not configured for this job
- Applicant hasn''t completed screening yet
- AI scoring is still processing

**Solution:**
1. Ensure screening questions are set up under the Screening tab
2. Check if the applicant has submitted their screening responses
3. Wait a few moments for AI scoring to complete

### Can''t Send SMS Messages

**Possible causes:**
- SMS integration not configured
- Phone number format issue
- Message exceeds character limits

**Solution:**
1. Verify SMS is set up in your automation settings
2. Ensure phone numbers include the country code
3. Keep messages concise (under 160 characters recommended)

### Need More Help?

If your issue isn''t listed here, please [submit a support ticket](/help-center/tickets) and our team will assist you.',
  ARRAY['troubleshooting', 'issues', 'problems', 'faq'],
  1
);
