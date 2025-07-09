import { generateVoiceNarration } from './audio-generator.ts';
import { createVideoWithExternalFFmpeg } from './video-creator.ts';
import { uploadVideoToStorage } from './storage-uploader.ts';

interface Scene {
  scene_number: number;
  start_time_seconds: number;
  end_time_seconds: number;
  narration_text: string;
  visual_description: string;
  content_scene_videos?: {
    video_url: string;
    video_status: string;
  }[];
}

interface ContentItem {
  id: string;
  title: string;
  script: string;
  content_scenes: Scene[];
}

export async function processVideoCreation(
  supabase: any,
  contentItem: ContentItem,
  voiceId: string = 'Aria'
): Promise<{
  storagePath: string;
  scenesProcessed: number;
  totalDuration: number;
}> {
  console.log('🎥 Starting video processing for content item:', contentItem.id);

  // Check if we have generated images for all scenes
  const scenesWithImages = contentItem.content_scenes.filter(scene => 
    scene.content_scene_videos?.some(video => 
      video.video_status === 'completed' && video.video_url
    )
  );

  if (scenesWithImages.length === 0) {
    throw new Error('No generated images found. Please generate scene images first.');
  }

  console.log(`🖼️ Found ${scenesWithImages.length} scenes with generated images`);

  // Log detailed scene timing information
  scenesWithImages.forEach((scene, index) => {
    console.log(`Scene ${index + 1}:`, {
      scene_number: scene.scene_number,
      timing: `${scene.start_time_seconds}s - ${scene.end_time_seconds}s`,
      duration: scene.end_time_seconds - scene.start_time_seconds,
      has_video: !!scene.content_scene_videos?.[0]?.video_url,
      video_url: scene.content_scene_videos?.[0]?.video_url,
      narration_preview: scene.narration_text.substring(0, 50) + '...'
    });
  });

  // Generate voice narration from the script
  const voiceIdMap: { [key: string]: string } = {
    'Aria': '9BWtsMINqrJLrRacOk9x',
    'Roger': 'CwhRBWXzGAHq8TQ4Fs17',
    'Sarah': 'EXAVITQu4vr4xnSDxMaL',
    'Laura': 'FGY2WhTYpPnrIDTdsKH5',
    'Charlie': 'IKne3meq5aSn9XLyUdCD'
  };

  const elevenlabsVoiceId = voiceIdMap[voiceId] || voiceIdMap['Aria'];
  console.log('🎤 Using ElevenLabs voice ID:', elevenlabsVoiceId);
  
  console.log('🎤 Generating audio for script:', contentItem.script.substring(0, 100) + '...');
  const audioData = await generateVoiceNarration(contentItem.script, elevenlabsVoiceId);
  console.log('🎵 Generated audio data size:', audioData.length, 'bytes');

  // Sort scenes by scene number to ensure proper order
  const sortedScenes = scenesWithImages.sort((a, b) => a.scene_number - b.scene_number);
  console.log('📋 Sorted scenes for video creation:', sortedScenes.length);
  
  // Create video using external FFmpeg service with proper timing
  console.log('🎬 Creating video with FFmpeg service...');
  const videoData = await createVideoWithExternalFFmpeg(sortedScenes, audioData, contentItem.title);
  console.log('✅ Video created successfully, size:', videoData.length, 'bytes');

  // Upload video to Supabase storage
  const fileName = `${contentItem.id}-${Date.now()}.mp4`;
  const storagePath = await uploadVideoToStorage(supabase, videoData, fileName);

  return {
    storagePath,
    scenesProcessed: scenesWithImages.length,
    totalDuration: sortedScenes[sortedScenes.length - 1]?.end_time_seconds || 30
  };
}
