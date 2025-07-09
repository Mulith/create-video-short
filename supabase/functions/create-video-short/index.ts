import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { processVideoCreation } from './video-processor.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  console.log('🎬 Video creation function called');
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    console.log('📥 Parsing request body...');
    const requestBody = await req.json();
    console.log('📥 Request body:', requestBody);
    const { contentItemId, voiceId = 'Aria' } = requestBody;
    if (!contentItemId || typeof contentItemId !== 'string') {
      console.error('❌ Invalid content item ID:', contentItemId);
      throw new Error('Content item ID is required and must be a string');
    }
    console.log('🎥 Starting video creation for content item:', contentItemId);
    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const elevenlabsKey = Deno.env.get('ELEVENLABS_API_KEY');
    const ffmpegServiceUrl = Deno.env.get('FFMPEG_SERVICE_URL');
    console.log('🔑 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasElevenlabsKey: !!elevenlabsKey,
      hasFFmpegServiceUrl: !!ffmpegServiceUrl,
      ffmpegServiceUrl: ffmpegServiceUrl
    });
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase environment variables');
      throw new Error('Missing Supabase environment variables');
    }
    if (!elevenlabsKey) {
      console.error('❌ Missing ElevenLabs API key');
      throw new Error('Missing ElevenLabs API key');
    }
    if (!ffmpegServiceUrl) {
      console.error('❌ Missing FFmpeg service URL');
      throw new Error('Missing FFmpeg service URL');
    }
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Fetch content item with scenes and generated images
    console.log('🔍 Fetching content item from database...');
    const { data: contentItem, error } = await supabase.from('content_items').select(`
        *,
        content_scenes!inner(
          *,
          content_scene_videos(*)
        )
      `).eq('id', contentItemId).order('scene_number', {
      foreignTable: 'content_scenes',
      ascending: true
    }).single();
    console.log('📊 Database query result:', {
      hasData: !!contentItem,
      error: error?.message,
      contentItemTitle: contentItem?.title,
      scenesCount: contentItem?.content_scenes?.length || 0
    });
    if (error) {
      console.error('❌ Database query error:', error);
      throw new Error(`Failed to fetch content item: ${error.message}`);
    }
    if (!contentItem) {
      console.error('❌ Content item not found');
      throw new Error('Content item not found');
    }
    if (!contentItem.content_scenes || contentItem.content_scenes.length === 0) {
      console.error('❌ No scenes found for content item');
      throw new Error('No scenes found for this content item');
    }
    console.log('📄 Retrieved content item:', {
      title: contentItem.title,
      scenesCount: contentItem.content_scenes?.length || 0
    });
    // Process video creation using the refactored video processor
    console.log('🎬 Starting video processing...');
    const result = await processVideoCreation(supabase, contentItem, voiceId);
    console.log('✅ Video processing completed:', result);
    // Update content item with video file path
    console.log('📝 Updating content item with video file path...');
    const { error: updateError } = await supabase.from('content_items').update({
      video_status: 'completed',
      video_file_path: result.storagePath,
      updated_at: new Date().toISOString()
    }).eq('id', contentItemId);
    if (updateError) {
      console.error('❌ Error updating content item:', updateError);
      throw new Error(`Failed to update content item: ${updateError.message}`);
    }
    console.log('🎉 Video creation completed successfully');
    return new Response(JSON.stringify({
      success: true,
      videoPath: result.storagePath,
      contentItemId: contentItemId,
      scenesProcessed: result.scenesProcessed,
      title: contentItem.title,
      totalDuration: result.totalDuration
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('💥 Video creation error:', error);
    console.error('💥 Error stack:', error.stack);
    console.error('💥 Error name:', error.name);
    console.error('💥 Error message:', error.message);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
      details: error.stack || 'No stack trace available'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
