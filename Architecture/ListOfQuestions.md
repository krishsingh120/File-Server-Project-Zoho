# List of Questions

1. why choose this project?
   - I chose this project to gain hands-on experience in backend system design, especially file handling, multi-user access, and cross-platform file sharing.

2. what PS says?
   - It asks to build a secure, multi-user, cross-platform file server for uploading, downloading, and managing files over a network.

3. what is NFS, FTP, SMB?
   - NFS allows a user to access files on a remote server as if they are stored locally. It is mainly used in Linux/Unix systems.
   - SMB is a protocol used mainly in Windows systems for file and resource sharing. It supports authentication and allows multiple users to access shared files securely
   - FTP is used to transfer files between a client and a server over a network. It is mainly used for uploading and downloading files, but it does not provide strong security by default.
   - NFS provides remote file access like local storage, FTP is used for file transfer between systems, and SMB is used for secure file sharing mainly in Windows environments.

4. if this type of product exist in market?
   - Yes, products like Google Drive, Dropbox, and enterprise file servers already exist, but this project helps in understanding the internal working of file sharing systems using NFS and SMB.


🧠 1. Architecture & Design
“Explain your system architecture”
“Why did you choose this design?”
“How do client and server communicate?”
“Did you use monolith or microservices?”
👥 2. Concurrency / Multi-user
“What happens if 100 users upload at the same time?”
“How do you prevent file conflicts?”
“Did you use locking or queues?”
🔐 3. Security
“How do you authenticate users?”
“How do you authorize file access?”
“How do you prevent unauthorized downloads?”
“How do you secure file transfer?”
💾 4. File Storage
“Where are files stored?”
“Why not store files in DB?”
“How do you manage metadata?”
“How do you handle large files?”
⚡ 5. Performance
“How do you optimize upload/download speed?”
“How do you reduce server load?”
“Did you use caching?”
📈 6. Scalability
“What if users increase to 1 million?”
“How will you scale storage?”
“How will you distribute load?”
🔄 7. Fault Tolerance / Reliability
“What if server crashes during upload?”
“How do you ensure data is not lost?”
“Do you use retry mechanisms?”
🌐 8. Networking
“Why did you choose HTTP / TCP?”
“How do NFS/SMB differ from your implementation?”
🧪 9. Edge Cases
“What if file is very large (10GB+)?”
“What if network disconnects?”
“Duplicate file handling?”
🛠 10. Your Decisions (MOST IMPORTANT 🔥)
“Why did you choose this approach?”
“What challenges did you face?”
“What will you improve?”