-- Owners choose a plant's picture: one of their photos, a new one, or a free species photo
-- from Wikimedia Commons. A chosen picture stays until they change it; check-ins no longer replace it.

-- 'cover': a photo taken or uploaded only to be the picture (not a check-in).
-- 'stock': a species photo from Wikimedia Commons, stored in our bucket with its credit.
alter type public.photo_kind add value if not exists 'cover';
alter type public.photo_kind add value if not exists 'stock';

-- Author, licence and source page for stock photos; null for the owner's own photos.
alter table public.photos add column credit jsonb;

alter table public.plants add column cover_pinned boolean not null default false;

-- 'cutout': one of the owner's photos with the background removed (transparent PNG via remove.bg).
alter type public.photo_kind add value if not exists 'cutout';
