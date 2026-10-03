-- Owners and household members can delete photo files of plants in their home.
-- Sitters cannot. Uses the home folder segment because the plant row may already be deleted.
create policy plant_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'plant-photos'
    and ((storage.foldername(name))[1])::uuid in (select private.managed_home_ids())
  );
