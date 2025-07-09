export async function uploadVideoToStorage(supabase, videoData, fileName) {
  console.log('☁️ Uploading video to Supabase storage...');
  console.log('📁 File name:', fileName);
  console.log('📊 File size:', videoData.length, 'bytes');
  const { data, error } = await supabase.storage.from('generated-videos').upload(fileName, videoData, {
    contentType: 'video/mp4',
    cacheControl: '3600',
    upsert: false
  });
  if (error) {
    console.error('❌ Storage upload error:', error);
    throw new Error(`Failed to upload video: ${error.message}`);
  }
  console.log('✅ Video uploaded successfully:', data.path);
  // Get the public URL for the uploaded file
  const { data: publicUrlData } = supabase.storage.from('generated-videos').getPublicUrl(data.path);
  console.log('🔗 Public URL generated:', publicUrlData.publicUrl);
  return data.path; // Return the storage path
}
