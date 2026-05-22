const firebaseConfig = {
  apiKey: "AIzaSyAyRMR6VjQymsAST5POlr3XWftqdXEYkFs",
  authDomain: "edupredict-app-37f9e.firebaseapp.com",
  projectId: "edupredict-app-37f9e",
  storageBucket: "edupredict-app-37f9e.firebasestorage.app",
  messagingSenderId: "825520937796",
  appId: "1:825520937796:web:8cc6419387186a366ed511"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();
