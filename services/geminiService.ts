
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { StyleType, AspectRatioType } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateCharacterImage = async (
  referenceImageBase64: string,
  mimeType: string,
  sceneDescription: string,
  style: StyleType,
  aspectRatio: AspectRatioType,
  retries = 2
): Promise<string> => {
  // Ưu tiên process.env.API_KEY từ hệ thống, nếu không có sẽ dùng khóa mặc định giá rẻ/tốc độ cao
  const API_KEY = process.env.API_KEY || "AIzaSyAjfcdFh720Ao5H-FEBN4WR7K5VjEzoHAo";
  
  // prompt được tối ưu ngắn gọn để giảm thiểu token và tăng tốc độ xử lý
  const prompt = `Consistent character: ${sceneDescription}. Style: ${style}. Identity match. High quality.`;

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: referenceImageBase64,
    },
  };

  const textPart = {
    text: prompt
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      // Sử dụng gemini-2.5-flash-image - model nhanh nhất và rẻ nhất cho ảnh hiện tại
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, textPart] },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio
          }
        }
      });

      const candidate = response.candidates?.[0];
      
      if (candidate?.finishReason === 'SAFETY') {
        throw new Error("Nội dung bị lọc (Safety).");
      }

      if (!candidate?.content?.parts) {
        throw new Error("AI không phản hồi.");
      }

      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }

      throw new Error("Không tìm thấy ảnh.");
    } catch (error: any) {
      const errorMsg = error?.message || "";
      
      // Nếu lỗi do API Key, ném lỗi ra ngoài để UI xử lý yêu cầu chọn key mới
      if (errorMsg.includes("API key not valid") || errorMsg.includes("INVALID_ARGUMENT") || errorMsg.includes("401") || errorMsg.includes("403")) {
        throw new Error("API key not valid");
      }

      if (attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1500;
        await delay(waitTime);
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error("Lỗi hệ thống hoặc quá tải.");
};
