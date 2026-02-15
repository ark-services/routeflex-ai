#!/bin/bash
# Script to apply the Board RLS fix migration to Supabase
# This fixes the issue where applicants don't show in the dashboard

set -e

echo "=========================================="
echo "Board RLS Fix Migration Script"
echo "=========================================="
echo ""

MIGRATION_FILE="supabase/migrations/00020_fix_board_rls.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "ERROR: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "This script will apply the Board RLS fix to your Supabase database."
echo "This migration updates RLS policies for boards, board_groups, board_columns,"
echo "board_status_labels, and board_cells to use the new is_company_member helper."
echo ""
echo "Choose an option to apply the migration:"
echo ""
echo "1. Copy SQL to clipboard (you can paste it in Supabase SQL Editor)"
echo "2. Show SQL on screen (for manual copy)"
echo "3. Try to apply via Supabase CLI (requires 'supabase login' first)"
echo "4. Exit"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
  1)
    # Try different clipboard commands based on OS
    if command -v pbcopy &> /dev/null; then
      cat "$MIGRATION_FILE" | pbcopy
      echo ""
      echo "✅ Migration SQL copied to clipboard!"
      echo ""
      echo "Next steps:"
      echo "1. Go to: https://supabase.com/dashboard/project/axnjswtfpudokkryooxi/sql"
      echo "2. Click 'New Query'"
      echo "3. Paste the SQL (Cmd+V / Ctrl+V)"
      echo "4. Click 'Run'"
    elif command -v xclip &> /dev/null; then
      cat "$MIGRATION_FILE" | xclip -selection clipboard
      echo "✅ Migration SQL copied to clipboard!"
      echo ""
      echo "Next steps:"
      echo "1. Go to: https://supabase.com/dashboard/project/axnjswtfpudokkryooxi/sql"
      echo "2. Click 'New Query'"
      echo "3. Paste the SQL (Ctrl+V)"
      echo "4. Click 'Run'"
    else
      echo "Clipboard command not found. Showing SQL instead..."
      echo ""
      cat "$MIGRATION_FILE"
    fi
    ;;

  2)
    echo ""
    echo "========== Migration SQL =========="
    cat "$MIGRATION_FILE"
    echo ""
    echo "==================================="
    echo ""
    echo "Copy the above SQL and paste it in Supabase SQL Editor:"
    echo "https://supabase.com/dashboard/project/axnjswtfpudokkryooxi/sql"
    ;;

  3)
    echo ""
    echo "Attempting to apply via Supabase CLI..."
    echo ""

    # Check if user is logged in
    if ! npx supabase projects list &> /dev/null; then
      echo "❌ Not logged in to Supabase CLI."
      echo ""
      echo "Please run: npx supabase login"
      echo "Then run this script again."
      exit 1
    fi

    # Try to link the project
    echo "Linking project..."
    npx supabase link --project-ref axnjswtfpudokkryooxi

    # Push migrations
    echo "Pushing migrations..."
    npx supabase db push

    echo ""
    echo "✅ Migration applied successfully!"
    ;;

  4)
    echo "Exiting..."
    exit 0
    ;;

  *)
    echo "Invalid choice. Exiting..."
    exit 1
    ;;
esac

echo ""
echo "=========================================="
echo "After applying the migration, test by:"
echo "1. Submitting a new application"
echo "2. Checking the Applicants Board dashboard"
echo "3. Verifying the count shows correctly"
echo "=========================================="
echo ""
echo "For more details, see: BOARD_RLS_FIX.md"
