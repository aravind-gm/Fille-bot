import os
import requests
from datasets import load_dataset
from sentence_transformers import SentenceTransformer
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import gc  # Garbage collector

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Memory-efficient dataset loading
# 1. Use streaming mode
# 2. Limit to ~1000 examples (adjust based on your memory constraints)
# 3. Process data in batches

print("Loading dataset in streaming mode...")
dataset = load_dataset("altaidevorg/women-health-mini", streaming=True)
conversation_data = []

# Limit the number of examples to process
MAX_EXAMPLES = 1000
print(f"Processing up to {MAX_EXAMPLES} examples...")

count = 0
for example in dataset["train"]:
    # Process conversation from this example
    for turn in example["conversations"]:
        conversation_data.append(turn["content"])
    
    # Increment counter and check if we've reached the limit
    count += 1
    if count >= MAX_EXAMPLES:
        break

# Free memory
del dataset
gc.collect()

print(f"Processed {count} examples, total conversations: {len(conversation_data)}")

print("Loading embedding model...")
model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")

print("Generating embeddings (this may take a while)...")
# Process embeddings in smaller batches to reduce memory usage
BATCH_SIZE = 100
conversation_embeddings = np.zeros((len(conversation_data), 384))  # 384 is the dimension of embeddings

for i in range(0, len(conversation_data), BATCH_SIZE):
    end_idx = min(i + BATCH_SIZE, len(conversation_data))
    batch = conversation_data[i:end_idx]
    batch_embeddings = model.encode(batch)
    conversation_embeddings[i:end_idx] = batch_embeddings
    print(f"Processed embeddings: {end_idx}/{len(conversation_data)}")
    # Force garbage collection after each batch
    gc.collect()

print("Embeddings generation complete!")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

def get_more_relevant_rsponse(query):
    query_embedding = model.encode([query])
    similarities = np.dot(conversation_embeddings, query_embedding.T).flatten()
    best_match_idx = np.argmax(similarities)
    return conversation_data[best_match_idx]

@app.post("/chat/")
async def chat_with_bot(user_query:dict):
    prompt = user_query.get("message", "")

    if not prompt:
        return {"response": "Prompt is required!"}
    
    history_response = get_more_relevant_rsponse(prompt)

    context_prompt = f"""
            You are a chatbot named fille AI specialized in women's health. Provide **clear, factual, and supportive** responses. 
            If the user's question involves medical advice, remind them to consult a healthcare professional.  

            User Question: {prompt}

            Below is a similar question/response from the knowledge base that may contain helpful information:
            {history_response}

            Please provide your own professional, friendly, and informative response that addresses the user's specific question.
    """
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "llama3-70b-8192",  
        "messages": [{"role": "user", "content": context_prompt}]
    }

    response = requests.post(GROQ_API_URL, json=payload, headers=headers)

    if response.status_code == 200:
        bot_reply = response.json()["choices"][0]["message"]["content"]
        return {
            "response": bot_reply
        }
    else:
        return {"response": "Error in fetching the data from groq AI"}

if __name__ == "__main__":
     import uvicorn
     uvicorn.run(app, host="0.0.0.0", port=8000)