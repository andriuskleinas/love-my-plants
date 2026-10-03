-- Windows facing in between (e.g. south-west): users pick two neighbouring sides.
alter type public.window_direction add value if not exists 'NE';
alter type public.window_direction add value if not exists 'SE';
alter type public.window_direction add value if not exists 'SW';
alter type public.window_direction add value if not exists 'NW';
