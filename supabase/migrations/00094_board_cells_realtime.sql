-- Migration: 00094_board_cells_realtime
--
-- Enable Supabase Realtime for the board_cells table so clients
-- can subscribe to live cell updates (e.g. from AI scoring automations).

ALTER PUBLICATION supabase_realtime ADD TABLE public.board_cells;

DO $$
BEGIN
  RAISE NOTICE '  board_cells added to supabase_realtime publication';
END $$;
