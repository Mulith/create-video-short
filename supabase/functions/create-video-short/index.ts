/// <reference types="https://deno.land/x/deno/cli/types.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

async function generateVoiceNarration(text, voiceId) {
  console.log('🎙️ Generating voice narration with ElevenLabs...');
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ElevenLabs API key not found');

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.5, style: 0.5, use_speaker_boost: true }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }
  const audioBuffer = await response.arrayBuffer();
  console.log('✅ Voice narration generated successfully');
  return new Uint8Array(audioBuffer);
}

async function createVideoWithExternalFFmpeg(scenes, audioData, title) {
    console.log('🎬 Calling external FFmpeg service...');
    const ffmpegServiceUrl = Deno.env.get('FFMPEG_SERVICE_URL');
    if (!ffmpegServiceUrl) {
        throw new Error('FFMPEG_SERVICE_URL environment variable not set');
    }

    const imageUrls = scenes.map(scene => scene.content_scene_videos?.[0]?.video_url).filter(Boolean);

    const formData = new FormData();
    formData.append('audio', new Blob([audioData]), 'audio.mp3');
    formData.append('imageUrls', JSON.stringify(imageUrls));
    formData.append('title', title);
    formData.append('parallax', 'true');

    const response = await fetch(`${ffmpegServiceUrl}/create-video`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FFmpeg service failed: ${response.status} - ${errorText}`);
    }

    const videoBuffer = await response.arrayBuffer();
    console.log('✅ Video received from service, size:', videoBuffer.byteLength);
    return new Uint8Array(videoBuffer);
}

async function uploadVideoToStorage(supabase, videoData, fileName) {
  console.log('☁️ Uploading video to Supabase storage...');
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
  const { data: publicUrlData } = supabase.storage.from('generated-videos').getPublicUrl(data.path);
  console.log('🔗 Public URL generated:', publicUrlData.publicUrl);
  return data.path;
}

serve(async (req)=>{
  console.log('🎬 Video creation function called');
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Parsing request body...');
    const requestBody = await req.json();
    const { contentItemId, voiceId = 'Aria' } = requestBody;
    if (!contentItemId) throw new Error('Content item ID is required');

    console.log('🎥 Starting video creation for content item:', contentItemId);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase environment variables');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: contentItem, error } = await supabase.from('content_items').select(`
        *,
        content_scenes!inner(
          *,
          content_scene_videos(*)
        )
      `).eq('id', contentItemId).single();

    if (error || !contentItem) {
      throw new Error(`Failed to fetch content item: ${error?.message || 'Not found'}`);
    }

    const scenesWithImages = contentItem.content_scenes.filter(s => s.content_scene_videos?.some(v => v.video_status === 'completed' && v.video_url));
    if (scenesWithImages.length === 0) {
      throw new Error('No generated images found.');
    }

    const voiceIdMap = {
      'Aria': '9BWtsMINqrJLrRacOk9x',
      'Roger': 'CwhRBWXzGAHq8TQ4Fs17',
      'Sarah': 'EXAVITQu4vr4xnSDxMaL',
      'Laura': 'FGY2WhTYpPnrIDTdsKH5',
      'Charlie': 'IKne3meq5aSn9XLyUdCD'
    };
    const elevenlabsVoiceId = voiceIdMap[voiceId] || voiceIdMap['Aria'];
    const audioData = await generateVoiceNarration(contentItem.script, elevenlabsVoiceId);
    
    const videoData = await createVideoWithExternalFFmpeg(scenesWithImages, audioData, contentItem.title);
    
    const fileName = `${contentItemId}-${Date.now()}.mp4`;
    const storagePath = await uploadVideoToStorage(supabase, videoData, fileName);

    await supabase.from('content_items').update({
      video_status: 'completed',
      video_file_path: storagePath,
      updated_at: new Date().toISOString()
    }).eq('id', contentItemId);

    console.log('🎉 Video creation completed successfully');
    return new Response(JSON.stringify({
      success: true,
      videoPath: storagePath,
      contentItemId: contentItemId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Video creation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
      details: error.stack || 'No stack trace available'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
