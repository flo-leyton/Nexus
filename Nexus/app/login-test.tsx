//1. IMPORTAR DEPENDENCIAS
import React, {useEffect, useState} from 'react';
import {View, Text, TextInput, Button} from 'react-native-paper';
import {auth} from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

//2. CONFIGURAR LAS VARIABLES
export default function Login(){
    const [correo, setCorreo]=useState("");
    const [contrasena, setContrasena]=useState("");
}

//3. Crear la funcion para iniciar sesion
const iniciarSesion=async()=>{
    if(correo == "" && contrasena == ""){
        Alert.alert("Error, complete todos los campos.");
    }
    
}

try {
    const usuario=await signInWithEmailAndPassword(
        auth, 
        correo,
        contrasena
    );
    Alert.alert("Bienvenido", "Usuario: "+usuario.user.email)

} catch(error) {
    Alert.alert("Error", "Correo o contrasena inv'alidos")

};

return(
    <View>
        <Text>
            Iniciar Sesion
        </Text>
        <TextInput
            placeholder = "Ingrese su correo"
            value = {correo}
            onChangeText = {setCorreo}
            keyboardType="email-address"
        />

        <TextInput
            placeholder = "Ingrese su correo"
            value = {correo}
            onChangeText = {setCorreo}
            keyboardType="email-address"
        />

    </View>
)