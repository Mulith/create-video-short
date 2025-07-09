// Compress audio data to reduce size
async function compressAudio(audioData) {
  console.log('🎵 Original audio size:', audioData.length, 'bytes');
  // If audio is already small enough (< 200KB), return as is
  if (audioData.length < 200000) {
    console.log('✅ Audio size is acceptable, no compression needed');
    return audioData;
  }
  try {
    // For now, we'll truncate if too large (basic approach)
    // In a production environment, you'd use proper audio compression
    if (audioData.length > 300000) {
      const compressionRatio = 300000 / audioData.length;
      const compressedSize = Math.floor(audioData.length * compressionRatio);
      const compressedAudio = audioData.slice(0, compressedSize);
      console.log('🗜️ Audio compressed from', audioData.length, 'to', compressedAudio.length, 'bytes');
      return compressedAudio;
    }
    return audioData;
  } catch (error) {
    console.warn('⚠️ Audio compression failed, using original:', error);
    return audioData;
  }
}
export async function createVideoWithExternalFFmpeg(scenes, audioData, title) {
  console.log('🎬 Calling external FFmpeg service...');
  console.log('🎞️ Processing', scenes.length, 'scenes');
  const ffmpegServiceUrl = Deno.env.get('FFMPEG_SERVICE_URL');
  if (!ffmpegServiceUrl) {
    throw new Error('FFMPEG_SERVICE_URL environment variable not set');
  }
  console.log('🔗 FFmpeg service URL:', ffmpegServiceUrl);
  try {
    // Prepare data exactly as the FFmpeg service expects
    const imageUrls = [];
    const durations = [];
    scenes.forEach((scene)=>{
      const imageUrl = scene.content_scene_videos?.[0]?.video_url;
      if (!imageUrl) {
        console.warn(`⚠️ No image URL found for scene ${scene.scene_number}`);
        return;
      }
      imageUrls.push(imageUrl);
      durations.push(scene.end_time_seconds - scene.start_time_seconds);
      console.log(`Scene ${scene.scene_number}: ${imageUrl} (${scene.end_time_seconds - scene.start_time_seconds}s)`);
    });
    if (imageUrls.length === 0) {
      throw new Error('No valid scenes with images found');
    }
    console.log(`📋 Prepared ${imageUrls.length} image URLs and durations`);
    console.log('🖼️ Image URLs:', imageUrls);
    console.log('⏱️ Durations:', durations);
    console.log('🎵 Original audio data size:', audioData.length, 'bytes');
    // Validate audio data
    if (!audioData || audioData.length === 0) {
      throw new Error('No audio data provided');
    }
    // Compress audio if needed - keep as MP3 since that's what ElevenLabs provides
    const optimizedAudioData = await compressAudio(audioData);
    console.log('🎵 Optimized audio data size:', optimizedAudioData.length, 'bytes');
    // Create FormData with the exact structure the FFmpeg service expects
    const formData = new FormData();
    // Add audio file as MP3 format (which is what ElevenLabs provides)
    const audioBlob = new Blob([
      optimizedAudioData
    ], {
      type: 'audio/mpeg'
    });
    formData.append('audioFile', audioBlob, 'narration.mp3');
    console.log('🎵 Audio file added as MP3:', audioBlob.size, 'bytes, type:', audioBlob.type);
    // Set audioType to mp3 to match the actual audio format we're sending
    formData.append('audioType', 'mp3');
    console.log('🎵 Audio type set to mp3');
    // Add image URLs - try both array format and individual format
    imageUrls.forEach((url, index)=>{
      formData.append(`imageUrls[${index}]`, url);
      console.log(`🖼️ Added imageUrls[${index}]:`, url);
    });
    // Also try sending as a single field (in case service expects this format)
    formData.append('imageUrls', JSON.stringify(imageUrls));
    console.log('🖼️ Also added imageUrls as JSON string');
    // Add durations - try both array format and individual format
    durations.forEach((duration, index)=>{
      formData.append(`durations[${index}]`, duration.toString());
      console.log(`⏱️ Added durations[${index}]:`, duration.toString());
    });
    // Also try sending as a single field
    formData.append('durations', JSON.stringify(durations));
    console.log('⏱️ Also added durations as JSON string');
    // Add configuration parameters with conservative settings
    formData.append('transition', 'none');
    formData.append('fps', '24');
    formData.append('resolution', '720x1280');
    console.log('⚙️ FormData prepared - let me log all entries:');
    for (const [key, value] of formData.entries()){
      if (value instanceof File || value instanceof Blob) {
        console.log(`  ${key}: [Blob/File] size=${value.size}, type=${value.type}`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }
    // Additional validation before sending
    const hasAudioFile = formData.has('audioFile');
    const hasAudioType = formData.has('audioType');
    const hasImageUrls = formData.has('imageUrls[0]') || formData.has('imageUrls');
    const hasDurations = formData.has('durations[0]') || formData.has('durations');
    console.log('✅ Pre-send validation:', {
      hasAudioFile,
      hasAudioType,
      hasImageUrls,
      hasDurations,
      audioSize: optimizedAudioData.length,
      imageCount: imageUrls.length,
      durationCount: durations.length
    });
    if (!hasAudioFile || !hasAudioType || !hasImageUrls || !hasDurations) {
      throw new Error(`FormData validation failed: audioFile=${hasAudioFile}, audioType=${hasAudioType}, imageUrls=${hasImageUrls}, durations=${hasDurations}`);
    }
    console.log('🚀 Sending request to FFmpeg service...');
    const response = await fetch(`${ffmpegServiceUrl}/create-video`, {
      method: 'POST',
      body: formData
    });
    console.log('📡 Response received - Status:', response.status);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FFmpeg service error response:', errorText);
      console.error('❌ Response status:', response.status);
      console.error('❌ Request details that failed:');
      console.error('   - Audio data size:', optimizedAudioData.length);
      console.error('   - Audio format sent: MP3');
      console.error('   - Audio type parameter: mp3');
      console.error('   - Image URLs count:', imageUrls.length);
      console.error('   - Durations count:', durations.length);
      console.error('   - Resolution:', '720x1280');
      console.error('   - FPS:', '24');
      console.error('   - Transition:', 'none');
      // Try to get more detailed error information
      if (response.status === 400) {
        console.error('❌ Bad Request - The FFmpeg service rejected our request format');
        // Let's try to understand what the service is actually receiving
        console.error('❌ Debugging FormData contents:');
        for (const [key, value] of formData.entries()){
          if (value instanceof File || value instanceof Blob) {
            console.error(`   - ${key}: [${value.constructor.name}] size=${value.size}, type=${value.type}`);
          } else {
            console.error(`   - ${key}: "${value}" (length: ${value.toString().length})`);
          }
        }
        throw new Error(`FFmpeg service bad request (400). The service says: ${errorText}. This might be a FormData parsing issue on the service side.`);
      } else if (response.status === 413) {
        throw new Error(`FFmpeg service payload too large (413). Audio size: ${optimizedAudioData.length} bytes. Error: ${errorText}`);
      } else if (response.status === 403) {
        throw new Error(`FFmpeg service authentication failed (403): ${errorText}`);
      } else if (response.status === 500) {
        throw new Error(`FFmpeg service internal error (500). Service may be experiencing issues: ${errorText}`);
      } else if (response.status === 503) {
        throw new Error(`FFmpeg service unavailable (503). Service may be down: ${errorText}`);
      }
      throw new Error(`FFmpeg service failed with status ${response.status}: ${errorText}`);
    }
    const videoBuffer = await response.arrayBuffer();
    console.log('✅ Video received from external FFmpeg service, size:', videoBuffer.byteLength, 'bytes');
    if (videoBuffer.byteLength === 0) {
      throw new Error('FFmpeg service returned empty video data');
    }
    return new Uint8Array(videoBuffer);
  } catch (error) {
    console.error('❌ Error in external FFmpeg video creation:', error);
    console.error('❌ Error details:', error.message);
    if (error.stack) {
      console.error('❌ Stack trace:', error.stack);
    }
    throw error;
  }
}
