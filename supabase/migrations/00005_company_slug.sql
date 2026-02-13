-- Migration: Add slug to companies table
-- Run this in the Supabase SQL Editor

-- Add slug column to companies
alter table public.companies add column slug text;

-- Create unique index on slug
create unique index companies_slug_idx on public.companies(slug);
