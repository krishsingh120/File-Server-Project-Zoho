# Interview Mein Exactly Ye Bolo
## Q: "BullMQ kyun use kiya?"

- "File upload ke baad heavy processing tasks the — MIME validation, metadata extraction. Ye sab synchronously karna matlab client ko 2-3 minute wait karana. BullMQ se maine ye kaam async queue mein daala — client ko turant response milta hai, background mein worker process karta hai. Failure pe automatic retry hai, concurrency control hai, aur Bull Dashboard se visibility bhi hai ki kaunsi jobs fail hui aur kyun."


Interview Mein Exactly Ye Bolo
## Q: "Bina scan kiye MinIO pe upload kar diya — safe hai?"

- "Ye intentional 2-phase design hai. Phase 1 mein basic validation karke file private MinIO bucket mein store karta hoon — directly accessible nahi hai. Phase 2 mein BullMQ worker deep scan karta hai. Jab tak processingStatus 'completed' na ho, presigned URL generate nahi hoti — matlab infected file kabhi client tak pahunch nahi sakti."


Interview Mein Exactly Ye Bolo
## Q: "Magic bytes check kaise implement kiya?"

- "File ke pehle 8 bytes read karte hain — ye har file type ke fixed signature hote hain. Hex mein convert karke known signatures se pattern matching karte hain. User ka declared MIME type aur actual detected type compare karte hain — mismatch pe file reject."

## Q: "Virus scan ka algorithm kya hai?"

- "ClamAV 3 techniques use karta hai — signature based detection jo Aho-Corasick string matching algorithm use karta hai ek saath hazaro patterns match karne ke liye, heuristic analysis jo suspicious behaviour detect karta hai, aur hash matching jo known malware hashes se O(1) mein compare karta hai. Ye Future Scope mein hai mera — abhi magic bytes tak implement kiya hai.

Interview ## Q: "Aur file types support kyun nahi kiye?"

- "Abhi common types cover kiye hain — jpeg, png, gif, pdf, zip, webp. Production mein file-type npm package use karunga jo 200+ types support karta hai."

Interview ## Q: "Agar actualMime null ho toh allow kyun kiya?"

- "Agar file type unknown hai — matlab MAGIC_BYTES map mein nahi hai — toh hum declared MIME trust karte hain. Production mein ye stricter hona chahiye — unknown types block karni chahiye."


Interview Mein Exactly Ye Bolo
## Q: "BullMQ worker mein kya ho raha hai?"

- "Worker queue se job uthata hai jisme fileId, objectKey, mimeType, userId hota hai. Pehle file MinIO se temp location pe download karta hai. Phir magic bytes read karke actual MIME type detect karta hai aur declared MIME se compare karta hai. Mismatch pe file reject, MongoDB update, MinIO se delete. Match pe processingStatus completed karta hai aur Socket.io se client ko real-time notify karta hai. Concurrency 5 rakhi hai taaki ek saath 5 se zyada files process na ho."

## Q: "19 jobs fail kyun hue?"

- "filePath vs objectKey mismatch tha — worker filePath expect kar raha tha but service objectKey bhej rahi thi. fs.existsSync(undefined) always false return karta hai. Fix: MinIO se objectKey use karke file download karni hai temp location pe."

Interview Mein Exactly Ye Bolo
## Q: "File security kaise handle ki?"

- "Magic bytes check implement kiya hai — file ke pehle 8 bytes read karke actual MIME type detect karta hoon aur declared MIME se compare karta hoon. Mismatch pe file reject ho jaati hai MinIO se bhi delete hoti hai aur user ko Socket.io se notify karta hoon."

## Q: "Virus scan implement kiya?"

- "Abhi nahi — ye Future Scope mein hai. Architecture already ready hai — BullMQ worker mein ek aur step add karni hai ClamAV ke liye. Magic bytes check se basic security cover ho jaati hai."

## Interview Q: "Admin kisi bhi file access kar sakta hai?"

"Abhi admin check nahi hai is flow mein — ye improvement point hai. Production mein req.user.role === 'admin' bhi check karna chahiye."

----
| Feature / Scenario | 🚫 Without Cache                | ✅ With Cache               |
| ------------------ | ------------------------------- | -------------------------- |
| MinIO Calls        | Har request pe call             | Sirf first request pe call |
| 1000 Downloads     | 1000 MinIO calls                | 1 MinIO call               |
| Response Time      | Slow (network latency involved) | Fast (Redis in-memory)     |
| CPU Usage          | High (repeated processing)      | Low                        |
| MinIO Load         | Overloaded                      | Relaxed                    |
| Scalability        | Poor                            | High                       |
| User Experience    | Delay / latency                 | Smooth & instant           |
| System Efficiency  | Inefficient                     | Optimized                  |


## Q: "File download kaise kaam karta hai?"

"Download pe pehle JWT verify hota hai, phir MongoDB se file metadata fetch karta hoon. Permission check karta hoon — owner hai ya shared file hai. Phir Redis mein presigned URL cache check karta hoon — cache hit pe directly return, miss pe MinIO se generate karke Redis mein 55 min ke liye store karta hoon. Presigned URL client ko deta hoon — client directly MinIO se file download karta hai, server ka bandwidth zero use hota hai."

## Q: "Presigned URL kyun use kiya?"

"2 reasons — security aur performance. Security: URL time-limited hai, expire hone ke baad useless. Performance: Client directly MinIO se download karta hai — server proxy nahi banta, bandwidth save hoti hai."

## Q: "Redis mein 3300 seconds kyun, 3600 kyun nahi?"

"Presigned URL 3600 seconds mein expire hogi. Agar Redis mein bhi 3600 rakha toh last second mein stale URL serve ho sakti hai. 300 seconds buffer rakha taaki URL expire hone se pehle cache clear ho jaye."