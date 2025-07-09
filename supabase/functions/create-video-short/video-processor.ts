import { generateVoiceNarration } from './audio-generator.ts';
import { createVideoWithExternalFFmpeg } from './video-creator.ts';
import { uploadVideoToStorage } from './storage-uploader.ts';
export async function processVideoCreation(supabase, contentItem, voiceId = 'Aria') {
  console.log('🎥 Starting video processing for content item:', contentItem.id);
  console.log('🎥 Content item title:', contentItem.title);
  console.log('🎥 Voice ID:', voiceId);
  try {
    // Validate content item
    if (!contentItem.content_scenes || !Array.isArray(contentItem.content_scenes)) {
      console.error('❌ Invalid content item: missing or invalid scenes array');
      console.error('❌ Content item structure:', JSON.stringify(contentItem, null, 2));
      throw new Error('Invalid content item: missing or invalid scenes array');
    }
    console.log('📊 Total scenes in content item:', contentItem.content_scenes.length);
    // Check if we have generated images for all scenes
    const scenesWithImages = contentItem.content_scenes.filter((scene)=>{
      const hasImages = scene.content_scene_videos && Array.isArray(scene.content_scene_videos) && scene.content_scene_videos.some((video)=>video.video_status === 'completed' && video.video_url);
      if (!hasImages) {
        console.warn(`⚠️ Scene ${scene.scene_number} has no completed images:`, {
          hasVideos: !!scene.content_scene_videos,
          videosCount: scene.content_scene_videos?.length || 0,
          videosStatus: scene.content_scene_videos?.map((v)=>({
              status: v.video_status,
              hasUrl: !!v.video_url
            })) || []
        });
      }
      return hasImages;
    });
    if (scenesWithImages.length === 0) {
      console.error('❌ No scenes with completed images found');
      console.error('❌ Scene breakdown:');
      contentItem.content_scenes.forEach((scene, index)=>{
        console.error(`   Scene ${index + 1}:`, {
          scene_number: scene.scene_number,
          has_videos: !!scene.content_scene_videos,
          videos_count: scene.content_scene_videos?.length || 0,
          videos: scene.content_scene_videos?.map((v)=>({
              status: v.video_status,
              has_url: !!v.video_url
            })) || []
        });
      });
      throw new Error('No generated images found. Please generate scene images first.');
    }
    console.log(`🖼️ Found ${scenesWithImages.length} scenes with generated images`);
    // Log detailed scene information for debugging
    scenesWithImages.forEach((scene, index)=>{
      const imageUrl = scene.content_scene_videos?.[0]?.video_url;
      console.log(`📋 Scene ${index + 1} details:`, {
        scene_number: scene.scene_number,
        timing: `${scene.start_time_seconds}s - ${scene.end_time_seconds}s`,
        duration: scene.end_time_seconds - scene.start_time_seconds,
        has_image_url: !!imageUrl,
        image_url_preview: imageUrl ? imageUrl.substring(0, 60) + '...' : 'N/A',
        narration_preview: scene.narration_text.substring(0, 50) + '...'
      });
    });
    // Validate script content
    if (!contentItem.script || typeof contentItem.script !== 'string' || contentItem.script.trim().length === 0) {
      console.error('❌ Invalid or missing script content');
      console.error('❌ Script type:', typeof contentItem.script);
      console.error('❌ Script length:', contentItem.script?.length || 0);
      throw new Error('Invalid or missing script content');
    }
    console.log('📝 Script validation passed:', {
      length: contentItem.script.length,
      preview: contentItem.script.substring(0, 100) + '...'
    });
    // Generate voice narration from the script
    const voiceIdMap = {
      'Aria': '9BWtsMINqrJLrRacOk9x',
      'Roger': 'CwhRBWXzGAHq8TQ4Fs17',
      'Sarah': 'EXAVITQu4vr4xnSDxMaL',
      'Laura': 'FGY2WhTYpPnrIDTdsKH5',
      'Charlie': 'IKne3meq5aSn9XLyUdCD'
    };
    const elevenlabsVoiceId = voiceIdMap[voiceId] || voiceIdMap['Aria'];
    console.log('🎤 Using ElevenLabs voice ID:', elevenlabsVoiceId, 'for voice:', voiceId);
    console.log('🎤 Generating audio for script...');
    const audioData = await generateVoiceNarration(contentItem.script, elevenlabsVoiceId);
    if (!audioData || audioData.length === 0) {
      console.error('❌ Failed to generate audio: no audio data received');
      throw new Error('Failed to generate audio: no audio data received');
    }
    console.log('🎵 Generated audio data:', {
      size: audioData.length,
      type: 'Uint8Array',
      firstBytes: Array.from(audioData.slice(0, 10)).map((b)=>b.toString(16)).join(' ')
    });
    // Sort scenes by scene number to ensure proper order
    const sortedScenes = scenesWithImages.sort((a, b)=>a.scene_number - b.scene_number);
    console.log('📋 Sorted scenes for video creation:', sortedScenes.length);
    // Validate that all scenes have the required data before calling FFmpeg
    const invalidScenes = sortedScenes.filter((scene)=>{
      const hasValidImageUrl = scene.content_scene_videos?.[0]?.video_url;
      const hasValidTiming = scene.start_time_seconds >= 0 && scene.end_time_seconds > scene.start_time_seconds;
      return !hasValidImageUrl || !hasValidTiming;
    });
    if (invalidScenes.length > 0) {
      console.error('❌ Found invalid scenes:', invalidScenes.map((s)=>({
          scene_number: s.scene_number,
          has_image: !!s.content_scene_videos?.[0]?.video_url,
          timing: `${s.start_time_seconds}-${s.end_time_seconds}`,
          duration: s.end_time_seconds - s.start_time_seconds
        })));
      throw new Error(`Found ${invalidScenes.length} scenes with invalid data (missing images or invalid timing)`);
    }
    // Create video using external FFmpeg service with proper timing
    console.log('🎬 Creating video with FFmpeg service...');
    console.log('🎬 Final validation before FFmpeg call:');
    console.log('   - Audio data size:', audioData.length, 'bytes');
    console.log('   - Scenes count:', sortedScenes.length);
    console.log('   - All scenes have images:', sortedScenes.every((s)=>!!s.content_scene_videos?.[0]?.video_url));
    const videoData = await createVideoWithExternalFFmpeg(sortedScenes, audioData, contentItem.title);
    if (!videoData || videoData.length === 0) {
      console.error('❌ Failed to create video: no video data received from FFmpeg service');
      throw new Error('Failed to create video: no video data received from FFmpeg service');
    }
    console.log('✅ Video created successfully:', {
      size: videoData.length,
      type: 'Uint8Array',
      firstBytes: Array.from(videoData.slice(0, 10)).map((b)=>b.toString(16)).join(' ')
    });
    // Upload video to Supabase storage
    const fileName = `${contentItem.id}-${Date.now()}.mp4`;
    console.log('☁️ Uploading video to storage with filename:', fileName);
    const storagePath = await uploadVideoToStorage(supabase, videoData, fileName);
    if (!storagePath) {
      console.error('❌ Failed to upload video to storage: no storage path returned');
      throw new Error('Failed to upload video to storage: no storage path returned');
    }
    console.log('✅ Video uploaded to storage:', storagePath);
    const totalDuration = sortedScenes.length > 0 ? sortedScenes[sortedScenes.length - 1]?.end_time_seconds || 30 : 30;
    const result = {
      storagePath,
      scenesProcessed: scenesWithImages.length,
      totalDuration
    };
    console.log('🎉 Video processing completed successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Error in video processing:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    throw new Error(`Video processing failed: ${error.message}`);
  }
}
